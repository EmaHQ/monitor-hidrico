"""
Scraper de datos hidrométricos para el Monitor Hídrico.

Fuentes:
  1. PNA  — Prefectura Naval Argentina (alturas de los ríos)
     https://contenidosweb.prefecturanaval.gob.ar/alturas/
  2. DMH  — Dirección de Meteorología e Hidrología de Paraguay (estaciones convencionales)
     https://www.meteorologia.gov.py/nivel-rio/indexconvencional.php

Salida: datos.json en la raíz del proyecto (una lista de diccionarios).

Uso:
    python backend/scraper.py
"""

from __future__ import annotations

import json
import logging
import re
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# Configuración general
# ---------------------------------------------------------------------------

RAIZ_PROYECTO = Path(__file__).resolve().parent.parent
ARCHIVO_SALIDA = RAIZ_PROYECTO / "datos.json"

URL_PNA = "https://contenidosweb.prefecturanaval.gob.ar/alturas/"
URL_DMH = "https://www.meteorologia.gov.py/nivel-rio/indexconvencional.php"

# Headers de navegador real: sin User-Agent algunos servidores oficiales
# responden 403 o directamente cortan la conexión.
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
    "Connection": "keep-alive",
}

TIMEOUT = 45          # el sitio del DMH tarda ~20-40 s en responder
INTENTOS = 3          # reintentos por fuente antes de darla por caída
ESPERA_ENTRE_INTENTOS = 3  # segundos (se multiplica por el nº de intento)

# ---------------------------------------------------------------------------
# Puertos que queremos extraer
# ---------------------------------------------------------------------------
# PARA AGREGAR MÁS PUERTOS: sumá una entrada a estos diccionarios.
#   clave  = nombre tal como aparece en la columna "Puerto"/"Localidad" de la
#            web, normalizado (MAYÚSCULAS y sin acentos; ver normalizar()).
#   valor  = nombre canónico que querés ver en datos.json.
# El orden de estos diccionarios es el orden de salida del JSON.
#
# Los nombres disponibles se pueden listar corriendo el script con la constante
# LISTAR_DISPONIBLES en True (ver más abajo, al final de cada scraper).

PUERTOS_PNA = {
    "ANDRESITO": "ANDRESITO",
    "IGUAZU": "IGUAZU",
    "CORRIENTES": "CORRIENTES",
    "BARRANQUERAS": "BARRANQUERAS",
    "FORMOSA": "FORMOSA",
    # Ejemplos de otros puertos disponibles en la misma tabla:
    # "POSADAS": "POSADAS",
    # "ITATI": "ITATI",
    # "PASO DE LA PATRIA": "P. DE PATRIA",
    # "ISLA DEL CERRITO": "CERRITO",
}

PUERTOS_DMH = {
    # En la web paraguaya el puerto de Asunción figura como "Asunción"
    # (normalizado queda "ASUNCION").
    "ASUNCION": "ASUNCION",
    # Otras localidades disponibles: "CONCEPCION", "PILAR", "VILLETA",
    # "ENCARNACION", "POZO HONDO", "ALBERDI", "HUMAITA", etc.
}

# Poner en True para que el script imprima todos los puertos que encontró en
# cada fuente. Sirve para copiar los nombres exactos al agregar estaciones.
LISTAR_DISPONIBLES = False

log = logging.getLogger("scraper")


# ---------------------------------------------------------------------------
# Utilidades de parseo
# ---------------------------------------------------------------------------

def normalizar(texto: str) -> str:
    """Pasa a MAYÚSCULAS, quita acentos y colapsa espacios.

    Permite comparar 'Asunción' con 'ASUNCION' y 'Paso de Patria ' con
    'PASO DE PATRIA' sin sorpresas.
    """
    if not texto:
        return ""
    sin_acentos = unicodedata.normalize("NFKD", texto)
    sin_acentos = "".join(c for c in sin_acentos if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", sin_acentos).strip().upper()


def a_float(texto: str | None) -> float | None:
    """Extrae el primer número de una celda.

    Tolera los formatos reales de ambas webs: '3.29', '2,85', '0.66 m',
    '-4 cm', y devuelve None para celdas vacías o sin dato ('S/E', '-', '').
    """
    if not texto:
        return None
    match = re.search(r"-?\d+(?:[.,]\d+)?", texto)
    if not match:
        return None
    try:
        return float(match.group(0).replace(",", "."))
    except ValueError:
        return None


def tendencia_desde_estado(estado: str | None) -> str:
    """Normaliza la columna 'Estado' de la PNA ('CRECE' / 'BAJA' / 'ESTAC.')."""
    e = normalizar(estado or "")
    if e.startswith("CRECE"):
        return "Crece"
    if e.startswith("BAJA"):
        return "Baja"
    if e.startswith("ESTAC"):
        return "Estacionario"
    return "Sin dato"


def tendencia_desde_variacion(variacion_m: float | None) -> str:
    """Deriva la tendencia a partir de la variación en metros.

    El DMH de Paraguay no publica una columna de tendencia, sólo la
    'VARIACIÓN DIARIA' en centímetros, así que la inferimos del signo.
    """
    if variacion_m is None:
        return "Sin dato"
    if variacion_m > 0.005:
        return "Crece"
    if variacion_m < -0.005:
        return "Baja"
    return "Estacionario"


def indices_de_columnas(fila_encabezado, esperados: dict[str, tuple[str, ...]]) -> dict[str, int]:
    """Mapea nombre lógico de columna -> posición real en la tabla.

    En vez de hardcodear 'la altura está en la celda 2', leemos la fila de
    encabezado (<th>) y buscamos por texto. Si mañana la web agrega o mueve una
    columna, el scraper sigue funcionando sin tocar índices.

    `esperados` es {clave_logica: (alias_1, alias_2, ...)} donde los alias son
    fragmentos de texto normalizado del encabezado. Gana el primer match.
    """
    celdas = [normalizar(c.get_text(" ", strip=True)) for c in fila_encabezado.find_all(["th", "td"])]
    indices: dict[str, int] = {}
    for clave, alias in esperados.items():
        for i, texto_celda in enumerate(celdas):
            if any(a in texto_celda for a in alias):
                indices[clave] = i
                break
    return indices


def celdas_de_fila(fila) -> list:
    """Devuelve todas las celdas de una fila, incluyendo <th>.

    IMPORTANTE: la tabla de la PNA usa <th> para el nombre del puerto y <td>
    para el resto de las columnas. Si sólo buscáramos <td>, todas las columnas
    quedarían corridas un lugar. Por eso siempre pedimos ["td", "th"].
    """
    return fila.find_all(["td", "th"])


def es_fila_de_datos(fila) -> bool:
    """Descarta encabezados: filas del <thead> o filas sin ningún <td>."""
    if fila.parent is not None and fila.parent.name == "thead":
        return False
    return bool(fila.find_all("td"))


def celda(celdas: list, indices: dict[str, int], clave: str) -> str | None:
    """Devuelve el texto de una celda por nombre lógico de columna."""
    i = indices.get(clave)
    if i is None or i >= len(celdas):
        return None
    return celdas[i].get_text(" ", strip=True)


def descargar(url: str, etiqueta: str) -> str:
    """GET con headers, timeout y reintentos con espera incremental."""
    ultimo_error: Exception | None = None
    for intento in range(1, INTENTOS + 1):
        try:
            log.info("[%s] descargando %s (intento %d/%d)", etiqueta, url, intento, INTENTOS)
            respuesta = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
            respuesta.raise_for_status()
            # Algunas páginas oficiales no declaran charset: si requests no
            # detecta encoding, usamos el que deduce del contenido.
            if not respuesta.encoding:
                respuesta.encoding = respuesta.apparent_encoding
            return respuesta.text
        except requests.RequestException as error:
            ultimo_error = error
            log.warning("[%s] falló el intento %d: %s", etiqueta, intento, error)
            if intento < INTENTOS:
                time.sleep(ESPERA_ENTRE_INTENTOS * intento)
    raise RuntimeError(f"No se pudo descargar {etiqueta} ({url})") from ultimo_error


def marca_de_tiempo() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


# ---------------------------------------------------------------------------
# Scraper 1: Prefectura Naval Argentina
# ---------------------------------------------------------------------------

def scrapear_pna() -> list[dict]:
    """Extrae los puertos de PUERTOS_PNA de la tabla de alturas de la PNA.

    Estructura de la página (verificada): una sola <table class="table
    table-hover fpTable">. En el <thead> hay un único <tr> de 13 <th>
    (Puerto | Río | Ult. registro | Variación | Periodo | Fecha Hora | Estado |
    ... | Alerta | Evacuación | Hist.) y en el <tbody> un <tr> por hidrómetro,
    donde el nombre del puerto es un <th> y las otras 12 columnas son <td>.

    DÓNDE SE BUSCAN LAS FILAS: soup.find("table", class_="fpTable") y después
    todos los <tr> de esa tabla. El <tr> del <thead> se usa para mapear
    columnas por nombre y el resto son los datos.
    """
    html = descargar(URL_PNA, "PNA")
    soup = BeautifulSoup(html, "html.parser")

    # Buscamos la tabla por su clase propia; si la cambian, caemos a la
    # primera <table> del documento.
    tabla = soup.find("table", class_="fpTable") or soup.find("table")
    if tabla is None:
        log.error("[PNA] no se encontró ninguna <table> en la página")
        return []

    filas = tabla.find_all("tr")
    if not filas:
        log.error("[PNA] la tabla no tiene filas")
        return []

    # Mapeo de columnas por texto de encabezado (ver indices_de_columnas).
    indices = indices_de_columnas(
        filas[0],
        {
            "puerto": ("PUERTO",),
            "rio": ("RIO",),
            "altura": ("ULT. REGISTRO", "ULT"),
            "variacion": ("VARIACION",),
            "fecha": ("FECHA HORA",),
            "estado": ("ESTADO",),
            "alerta": ("ALERTA",),
            "evacuacion": ("EVACUACION",),
        },
    )
    if "puerto" not in indices or "altura" not in indices:
        log.error("[PNA] cambió el encabezado de la tabla, revisar indices_de_columnas(): %s", indices)
        return []

    encontrados: dict[str, dict] = {}
    disponibles: list[str] = []

    for fila in filas[1:]:
        if not es_fila_de_datos(fila):  # encabezados repetidos o separadores
            continue
        celdas = celdas_de_fila(fila)

        nombre_web = celda(celdas, indices, "puerto")
        clave = normalizar(nombre_web)
        if not clave:
            continue
        disponibles.append(clave)

        # Acá está el filtro: sólo nos quedamos con los puertos configurados.
        if clave not in PUERTOS_PNA:
            continue

        altura = a_float(celda(celdas, indices, "altura"))
        encontrados[clave] = {
            "puerto": PUERTOS_PNA[clave],
            "rio": normalizar(celda(celdas, indices, "rio")) or None,
            "altura_m": altura,
            "tendencia": tendencia_desde_estado(celda(celdas, indices, "estado")),
            "variacion_m": a_float(celda(celdas, indices, "variacion")),
            "fecha_medicion": celda(celdas, indices, "fecha"),
            "alerta_m": a_float(celda(celdas, indices, "alerta")),
            "evacuacion_m": a_float(celda(celdas, indices, "evacuacion")),
            "fuente": "PNA",
            "url_fuente": URL_PNA,
            "actualizado_en": marca_de_tiempo(),
        }

    if LISTAR_DISPONIBLES:
        log.info("[PNA] puertos disponibles: %s", sorted(set(disponibles)))

    for faltante in PUERTOS_PNA.keys() - encontrados.keys():
        log.warning("[PNA] no se encontró el puerto '%s' en la tabla", faltante)

    # Respetamos el orden de PUERTOS_PNA en la salida.
    return [encontrados[c] for c in PUERTOS_PNA if c in encontrados]


# ---------------------------------------------------------------------------
# Scraper 2: Meteorología Paraguay (DMH)
# ---------------------------------------------------------------------------

def scrapear_dmh() -> list[dict]:
    """Extrae los puertos de PUERTOS_DMH de las tablas del DMH paraguayo.

    Estructura de la página (verificada): cinco <table class="table
    table-striped">, una por río, cada una precedida por un <h3> con el nombre
    del río ('RIO PARAGUAY', 'RIO PARANA', 'RIO PILCOMAYO', 'RIO TEBICUARY',
    'RIO NEGRO'). Encabezado: LOCALIDAD | FECHA | NIVEL DEL DÍA |
    VARIACIÓN DIARIA | Mínimo Histórico | Máximo Histórico | (VER MÁS).

    DÓNDE SE BUSCAN LAS FILAS: soup.find_all("table", class_="table-striped"),
    y dentro de cada tabla todos los <tr>; el río se toma del <h3> anterior a
    la tabla (tabla.find_previous("h3")).

    Ojo con las unidades: el nivel viene como '0.66 m' y la variación como
    '-3 cm'; convertimos la variación a metros para que sea comparable con la
    de la PNA.
    """
    html = descargar(URL_DMH, "DMH")
    soup = BeautifulSoup(html, "html.parser")

    tablas = soup.find_all("table", class_="table-striped") or soup.find_all("table")
    if not tablas:
        log.error("[DMH] no se encontró ninguna <table> en la página")
        return []

    encontrados: dict[str, dict] = {}
    disponibles: list[str] = []

    for tabla in tablas:
        # El nombre del río está en el <h3> que precede a cada tabla.
        titulo = tabla.find_previous("h3")
        rio = normalizar(titulo.get_text(" ", strip=True)).removeprefix("RIO ") if titulo else None

        filas = tabla.find_all("tr")
        if not filas:
            continue

        indices = indices_de_columnas(
            filas[0],
            {
                "puerto": ("LOCALIDAD",),
                "fecha": ("FECHA",),
                "altura": ("NIVEL DEL DIA", "NIVEL"),
                "variacion": ("VARIACION",),
            },
        )
        if "puerto" not in indices or "altura" not in indices:
            log.warning("[DMH] encabezado inesperado en una tabla, se omite: %s", indices)
            continue

        for fila in filas[1:]:
            if not es_fila_de_datos(fila):
                continue
            celdas = celdas_de_fila(fila)

            nombre_web = celda(celdas, indices, "puerto")
            clave = normalizar(nombre_web)
            if not clave:
                continue
            disponibles.append(clave)

            # Filtro por puertos configurados.
            if clave not in PUERTOS_DMH:
                continue

            variacion_cm = a_float(celda(celdas, indices, "variacion"))
            variacion_m = round(variacion_cm / 100, 3) if variacion_cm is not None else None

            encontrados[clave] = {
                "puerto": PUERTOS_DMH[clave],
                "rio": rio,
                "altura_m": a_float(celda(celdas, indices, "altura")),
                "tendencia": tendencia_desde_variacion(variacion_m),
                "variacion_m": variacion_m,
                "fecha_medicion": celda(celdas, indices, "fecha"),
                # El DMH no publica umbrales de alerta/evacuación.
                "alerta_m": None,
                "evacuacion_m": None,
                "fuente": "DMH",
                "url_fuente": URL_DMH,
                "actualizado_en": marca_de_tiempo(),
            }

    if LISTAR_DISPONIBLES:
        log.info("[DMH] localidades disponibles: %s", sorted(set(disponibles)))

    for faltante in PUERTOS_DMH.keys() - encontrados.keys():
        log.warning("[DMH] no se encontró la localidad '%s' en las tablas", faltante)

    return [encontrados[c] for c in PUERTOS_DMH if c in encontrados]


# ---------------------------------------------------------------------------
# Orquestación
# ---------------------------------------------------------------------------

def guardar_json(registros: list[dict], destino: Path = ARCHIVO_SALIDA) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    with destino.open("w", encoding="utf-8") as archivo:
        json.dump(registros, archivo, ensure_ascii=False, indent=2)
    log.info("Guardados %d registros en %s", len(registros), destino)


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )

    registros: list[dict] = []
    # Cada fuente se envuelve por separado: si una se cae, guardamos lo que
    # trajo la otra en lugar de perder toda la corrida.
    for etiqueta, scraper in (("PNA", scrapear_pna), ("DMH", scrapear_dmh)):
        try:
            parciales = scraper()
            log.info("[%s] %d puertos extraídos", etiqueta, len(parciales))
            registros.extend(parciales)
        except Exception as error:  # noqa: BLE001 - una fuente caída no debe cortar la otra
            log.error("[%s] fuente no disponible: %s", etiqueta, error)

    if not registros:
        log.error("No se extrajo ningún dato: no se sobrescribe datos.json")
        return 1

    guardar_json(registros)
    for registro in registros:
        log.info(
            "  %-14s %-10s %s m (%s)",
            registro["puerto"],
            registro["rio"] or "-",
            registro["altura_m"],
            registro["tendencia"],
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
