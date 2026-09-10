"""
Scraper "historiador" de datos hidrométricos para el Monitor Hídrico.

Fuentes:
  1. PNA  — Prefectura Naval Argentina (alturas de los ríos)
     https://contenidosweb.prefecturanaval.gob.ar/alturas/
  2. DMH  — Dirección de Meteorología e Hidrología de Paraguay (estaciones convencionales)
     https://www.meteorologia.gov.py/nivel-rio/indexconvencional.php

En vez de escribir una "foto" del día, el script mantiene la serie histórica
completa en history.json (raíz del proyecto), con la forma:

    {"DATES": ["2026-08-03", ...], "RIVERS": [{..., "stations": [{"n", "al", "ev", "r"}]}]}

Cada corrida agrega la fecha de hoy a DATES (o reutiliza la existente si ya
corrió hoy) y escribe un valor por puerto en su serie `r`: el nivel scrapeado
o null si ese puerto no vino en el scraping.

La web de la PNA geobloquea los rangos de IP de GitHub Actions, así que en CI la
descarga se hace a través de ScraperAPI. Se activa sola si existe la variable de
entorno SCRAPER_API_KEY; sin ella (por ejemplo en tu máquina) va directo.

Uso:
    python backend/scraper.py
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
import unicodedata
from datetime import date, datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# Configuración general
# ---------------------------------------------------------------------------

RAIZ_PROYECTO = Path(__file__).resolve().parent.parent
ARCHIVO_HISTORIAL = RAIZ_PROYECTO / "history.json"

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
# ScraperAPI (sólo para la PNA)
# ---------------------------------------------------------------------------
# La PNA rechaza las IP de los runners de GitHub Actions. ScraperAPI hace de
# proxy: le pasamos api_key + url y nos devuelve el HTML de la página original.
#
# Se usa únicamente si SCRAPER_API_KEY está definida y no está vacía. Ojo: en
# GitHub Actions, si el secreto no existe la variable llega como cadena vacía,
# así que se evalúa por contenido y no por presencia.
#
# El DMH de Paraguay no bloquea nada, por eso va siempre directo y no gasta
# créditos de la API.
URL_SCRAPER_API = "http://api.scraperapi.com"
SCRAPER_API_KEY = (os.getenv("SCRAPER_API_KEY") or "").strip()
TIMEOUT_SCRAPER_API = 70  # el proxy reintenta por su cuenta y puede tardar más

# ---------------------------------------------------------------------------
# Puertos que queremos extraer
# ---------------------------------------------------------------------------
# PARA AGREGAR MÁS PUERTOS: sumá una entrada a estos diccionarios.
#   clave  = nombre tal como aparece en la columna "Puerto"/"Localidad" de la
#            web, normalizado (MAYÚSCULAS y sin acentos; ver normalizar()).
#   valor  = nombre del puerto ("n") en history.json.
#
# El valor es el que une el scraping con el historial: se compara normalizado
# contra el campo "n" de cada puerto, así que 'IGUAZU' encuentra a 'IGUAZÚ'.
# Si scrapeás un puerto que todavía no existe en history.json, el script avisa
# y descarta esa lectura (no inventa puertos).
#
# Los nombres disponibles se pueden listar corriendo el script con la constante
# LISTAR_DISPONIBLES en True (ver más abajo, al final de cada scraper).

PUERTOS_PNA = {
    # --- Río Paraguay ---
    "BOUVIER": "BOUVIER",
    "FORMOSA": "FORMOSA",
    "BERMEJO": "BERMEJO",
    "LAS PALMAS": "LAS PALMAS",
    "ISLA DEL CERRITO": "ISLA DEL CERRITO",
    # --- Río Iguazú ---
    # OJO: las represas de Brasil publican CAUDAL en m³/s, no altura en metros
    # (ver la nota al pie de la web de la PNA). En history.json van marcadas con
    # "u": "m³/s" para que el front-end no las mezcle en el eje de los metros.
    "REPRESA CAPANEMA (BRASIL)": "CAPANEMA",
    "ANDRESITO": "ANDRESITO",
    "IGUAZU": "IGUAZÚ",
    # --- Río Paraná ---
    "REPRESA ITAIPU (BRASIL)": "ITAIPÚ",  # también caudal en m³/s, no metros
    "LIBERTAD": "LIBERTAD",
    "POSADAS": "POSADAS",
    "ITUZAINGO": "ITUZAINGÓ",
    "ITA IBATE": "ITÁ IBATÉ",
    "ITATI": "ITATÍ",
    "PASO DE LA PATRIA": "PASO DE LA PATRIA",
    "CORRIENTES": "CORRIENTES",
    "BARRANQUERAS": "BARRANQUERAS",
    "EMPEDRADO": "EMPEDRADO",
    "GOYA": "GOYA",
    "ESQUINA": "ESQUINA",
    # --- Río Uruguay ---
    "EL SOBERBIO": "EL SOBERBIO",
    # En la tabla de la PNA hay DOS "San Javier": este (río Uruguay) y
    # "SAN JAVIER (SANTA FE)" sobre el río San Javier. Al comparar por clave
    # exacta sólo entra el que pedimos.
    "SAN JAVIER": "SAN JAVIER",
    "SANTO TOME": "SANTO TOMÉ",
    "ALVEAR": "ALVEAR",
    "PASO DE LOS LIBRES": "PASO DE LOS LIBRES",
    "MONTE CASEROS": "MONTE CASEROS",
}

PUERTOS_DMH = {
    # --- Río Pilcomayo ---
    "POZO HONDO": "POZO HONDO",
    # --- Río Paraguay ---
    # Las localidades brasileñas llevan el país en el nombre de la celda
    # ("Cáceres - Brasil"), por eso la clave lo incluye.
    "CACERES - BRASIL": "CÁCERES",
    "BAHIA NEGRA": "BAHÍA NEGRA",
    "PUERTO MURTINHO - BRASIL": "MURTINHO",
    "VALLEMI": "VALLEMI",
    "CONCEPCION": "CONCEPCIÓN",
    "ASUNCION": "ASUNCIÓN",
}

# Poner en True para que el script imprima todos los puertos que encontró en
# cada fuente. Sirve para copiar los nombres exactos al agregar puertos.
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


def sin_credenciales(texto: str) -> str:
    """Tapa la API key para que no aparezca en los logs.

    requests incluye la URL completa en sus mensajes de error, y esa URL lleva
    el api_key como parámetro. Los logs de Actions son públicos en repos
    públicos, así que la reemplazamos antes de imprimir cualquier cosa.
    """
    if SCRAPER_API_KEY:
        return texto.replace(SCRAPER_API_KEY, "***")
    return texto


def descargar(url: str, etiqueta: str, via_scraperapi: bool = False) -> str:
    """GET con headers, timeout y reintentos con espera incremental.

    Con `via_scraperapi=True` la descarga sale por ScraperAPI, pero sólo si hay
    una SCRAPER_API_KEY cargada; si no la hay, cae a la petición directa de
    siempre (el caso de correr el script en local).
    """
    usar_proxy = via_scraperapi and bool(SCRAPER_API_KEY)

    if usar_proxy:
        # ScraperAPI recibe la URL original como parámetro y devuelve su HTML.
        # No le mandamos HEADERS: el proxy arma su propio fingerprint de
        # navegador (y sin keep_headers ignoraría los nuestros de todos modos).
        destino, parametros = URL_SCRAPER_API, {"api_key": SCRAPER_API_KEY, "url": url}
        cabeceras, tiempo_limite = None, TIMEOUT_SCRAPER_API
    else:
        destino, parametros = url, None
        cabeceras, tiempo_limite = HEADERS, TIMEOUT
        if via_scraperapi:
            log.info("[%s] sin SCRAPER_API_KEY: se descarga directo", etiqueta)

    ruta = f"{url} (vía ScraperAPI)" if usar_proxy else url
    ultimo_error: Exception | None = None

    for intento in range(1, INTENTOS + 1):
        try:
            log.info("[%s] descargando %s (intento %d/%d)", etiqueta, ruta, intento, INTENTOS)
            respuesta = requests.get(destino, params=parametros, headers=cabeceras, timeout=tiempo_limite)
            respuesta.raise_for_status()
            # Algunas páginas oficiales no declaran charset: si requests no
            # detecta encoding, usamos el que deduce del contenido.
            if not respuesta.encoding:
                respuesta.encoding = respuesta.apparent_encoding
            return respuesta.text
        except requests.RequestException as error:
            ultimo_error = error
            log.warning("[%s] falló el intento %d: %s", etiqueta, intento, sin_credenciales(str(error)))
            if intento < INTENTOS:
                time.sleep(ESPERA_ENTRE_INTENTOS * intento)

    raise RuntimeError(f"No se pudo descargar {etiqueta} ({ruta})") from ultimo_error


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
    # Única fuente que pasa por ScraperAPI (geobloqueo desde GitHub Actions).
    html = descargar(URL_PNA, "PNA", via_scraperapi=True)
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
    # Sin geobloqueo: siempre directo, para no gastar créditos de ScraperAPI.
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
# Historial (history.json)
# ---------------------------------------------------------------------------

def cargar_historial(ruta: Path = ARCHIVO_HISTORIAL) -> dict:
    """Lee history.json y valida que tenga la estructura esperada."""
    with ruta.open(encoding="utf-8") as archivo:
        historial = json.load(archivo)
    if not isinstance(historial.get("DATES"), list) or not isinstance(historial.get("RIVERS"), list):
        raise ValueError('se esperaba {"DATES": [...], "RIVERS": [...]}')
    return historial


def indice_del_dia(historial: dict, fecha_iso: str) -> int:
    """Devuelve el índice de la columna de hoy dentro de DATES.

    Si la fecha no está, se agrega al final (un día nuevo de historia). Si ya
    está —porque el script corrió dos veces el mismo día— se reutiliza su
    índice y los valores se sobrescriben, así la corrida es idempotente.
    """
    fechas = historial["DATES"]
    if fecha_iso in fechas:
        indice = fechas.index(fecha_iso)
        log.info("La fecha %s ya existía (índice %d): se sobrescriben sus valores", fecha_iso, indice)
        return indice
    fechas.append(fecha_iso)
    log.info("Fecha nueva agregada al historial: %s (índice %d)", fecha_iso, len(fechas) - 1)
    return len(fechas) - 1


def sincronizar_longitudes(historial: dict) -> None:
    """Garantiza que cada serie `r` tenga exactamente len(DATES) valores.

    Es la invariante que sostiene todo el front-end: el valor de la posición i
    corresponde a DATES[i]. Al agregar una fecha nueva, acá se abre el hueco
    (con null) en todos los puertos antes de escribir las lecturas del día.
    """
    total = len(historial["DATES"])
    for rio in historial["RIVERS"]:
        for puerto in rio.get("stations", []):
            serie = puerto.setdefault("r", [])
            if len(serie) < total:
                serie.extend([None] * (total - len(serie)))
            elif len(serie) > total:
                log.warning(
                    "El puerto '%s' tenía %d valores para %d fechas: se recorta el excedente",
                    puerto.get("n"), len(serie), total,
                )
                del serie[total:]


def registrar_lecturas(historial: dict, indice: int, lecturas: dict[str, float | None]) -> None:
    """Escribe en la posición `indice` de cada puerto su lectura de hoy.

    `lecturas` viene indexado por nombre de puerto normalizado. Los puertos que
    no aparecen en el scraping quedan en null, que es como el front-end
    representa "sin dato" (S/D).
    """
    usadas: set[str] = set()
    con_dato = 0

    for rio in historial["RIVERS"]:
        for puerto in rio.get("stations", []):
            clave = normalizar(puerto.get("n", ""))
            valor = lecturas.get(clave)
            if clave in lecturas:
                usadas.add(clave)
            if valor is not None:
                con_dato += 1
            puerto["r"][indice] = valor

    total_puertos = sum(len(rio.get("stations", [])) for rio in historial["RIVERS"])
    log.info("Lecturas escritas: %d con dato, %d en null", con_dato, total_puertos - con_dato)

    # Puertos scrapeados que no figuran en history.json: se pierden. Si querés
    # conservarlos, agregalos al río correspondiente.
    for huerfano in sorted(set(lecturas) - usadas):
        log.warning("El puerto '%s' no existe en history.json: se descarta", huerfano)


def formatear_json(datos: dict) -> str:
    """Serializa con indentación de 2 espacios pero series `r` en una línea.

    Con indent=2 puro, cada nivel del array `r` ocupa una línea y el archivo se
    vuelve inmanejable (miles de líneas). Colapsamos sólo los arrays que son
    puramente numéricos/null, que es exactamente el caso de las series.
    """
    texto = json.dumps(datos, ensure_ascii=False, indent=2)
    serie_numerica = re.compile(
        r"\[\s*((?:-?\d+(?:\.\d+)?|null)(?:\s*,\s*(?:-?\d+(?:\.\d+)?|null))*)\s*\]"
    )
    return serie_numerica.sub(
        lambda m: "[" + ", ".join(re.split(r"\s*,\s*", m.group(1))) + "]",
        texto,
    )


def guardar_historial(historial: dict, destino: Path = ARCHIVO_HISTORIAL) -> None:
    with destino.open("w", encoding="utf-8") as archivo:
        archivo.write(formatear_json(historial) + "\n")
    log.info(
        "history.json actualizado: %d fechas, %d puertos",
        len(historial["DATES"]),
        sum(len(rio.get("stations", [])) for rio in historial["RIVERS"]),
    )


# ---------------------------------------------------------------------------
# Orquestación
# ---------------------------------------------------------------------------

def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )
    log.info(
        "Descarga de la PNA: %s",
        "ScraperAPI" if SCRAPER_API_KEY else "directa (sin SCRAPER_API_KEY)",
    )

    # 1. Historial existente. Si no se puede leer, cortamos antes de scrapear:
    #    no queremos perder la serie ni escribir un archivo a medias.
    try:
        historial = cargar_historial()
    except (OSError, ValueError, json.JSONDecodeError) as error:
        log.error("No se pudo leer %s: %s", ARCHIVO_HISTORIAL, error)
        return 1

    # 2. Scraping. Cada fuente va en su propio try: si una se cae, seguimos con
    #    la otra y los puertos faltantes quedarán en null.
    registros: list[dict] = []
    for etiqueta, scraper in (("PNA", scrapear_pna), ("DMH", scrapear_dmh)):
        try:
            parciales = scraper()
            log.info("[%s] %d puertos extraídos", etiqueta, len(parciales))
            registros.extend(parciales)
        except Exception as error:  # noqa: BLE001 - una fuente caída no debe cortar la otra
            log.error("[%s] fuente no disponible: %s", etiqueta, error)

    if not registros:
        log.error("No se extrajo ningún dato: history.json queda intacto")
        return 1

    for registro in registros:
        log.info(
            "  %-20s %-12s %s m (%s)",
            registro["puerto"],
            registro["rio"] or "-",
            registro["altura_m"],
            registro["tendencia"],
        )

    # 3. Volcado al historial: fecha de hoy + un valor por puerto.
    lecturas = {normalizar(r["puerto"]): r["altura_m"] for r in registros}
    indice = indice_del_dia(historial, date.today().isoformat())
    sincronizar_longitudes(historial)
    registrar_lecturas(historial, indice, lecturas)
    guardar_historial(historial)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
