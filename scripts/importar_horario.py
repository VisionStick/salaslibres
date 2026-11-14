#!/usr/bin/env python3
"""Normaliza el archivo que usa Crear horario y verifica el catálogo importado."""

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import unicodedata
from urllib.request import urlopen

DATOS = Path(__file__).resolve().parents[1] / "docs" / "data"
REPO = "https://github.com/AlvinIsCrack/horario-usm"
WEB = "https://alviniscrack.github.io/horario-usm/"
RUTA_FUENTE = "src/lib/data"
CODIGO = re.compile(r"-?((?:KS|[A-Z])\d{3}[A-Z]?)(?:[- ]*(?:SAN JOAQUIN|SJ)(?:\s+(?:A|HA))?)?")
MARCA_SJ = re.compile(r"\bSAN JOAQUIN\b|(?:^|[-\s])SJ(?:\s|$)")
DIAS = ("Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo")


def verificar(condicion, mensaje):
    if not condicion:
        raise ValueError(mensaje)


def texto_busqueda(texto):
    return "".join(
        letra for letra in unicodedata.normalize("NFD", texto.upper())
        if unicodedata.category(letra) != "Mn"
    ).strip()


def hora(minutos):
    return f"{minutos // 60:02}:{minutos % 60:02}"


def tabla_bloques():
    # Correspondencia de constants/usm.ts y helpers/time.ts de Horario USM.
    bloques = {}
    for n in range(1, 21):
        inicio = 8 * 60 + 15 + 35 * (n - 1) + 15 * ((n - 1) // 2)
        if n > 8:
            inicio += 45
        bloques[n] = {"numero": n, "inicio": hora(inicio), "fin": hora(inicio + 35)}
    return bloques


def archivo_fuente(archivo, revision, repo_local):
    ruta = f"{RUTA_FUENTE}/{archivo}"
    if repo_local:
        return subprocess.check_output(
            ["git", "-C", str(repo_local), "show", f"{revision}:{ruta}"]
        )
    url = f"https://raw.githubusercontent.com/AlvinIsCrack/horario-usm/{revision}/{ruta}"
    with urlopen(url, timeout=40) as respuesta:
        return respuesta.read()


def sala_normalizada(nombre, alias):
    texto = texto_busqueda(nombre)
    if texto in ("", "SIN SALA", "SIN INFORMACION", "POR ASIGNAR"):
        return None
    if texto in alias:
        return alias[texto]
    coincidencia = CODIGO.fullmatch(texto)
    if coincidencia:
        return coincidencia[1]
    return nombre.lstrip("-").strip()


def preparar_ramos(catalogo, bloques, alias, solo_en_campus=False):
    ramos = []
    for sigla, paralelos in sorted(catalogo.items()):
        verificar(bool(paralelos), f"{sigla} no tiene paralelos en el archivo fuente")
        grupos = []
        nombre = next(iter(paralelos.values()))["nombre"]
        verificar(bool(nombre.strip()), f"{sigla} no tiene nombre")
        for numero, original in sorted(paralelos.items()):
            verificar(original["sigla"] == sigla and original["paralelo"] == numero,
                      f"Sigla o paralelo inconsistente en {sigla} P{numero}")
            profesores = original["profesor"]
            verificar(isinstance(profesores, list) and all(isinstance(p, str) for p in profesores),
                      f"Profesores inválidos en {sigla} P{numero}")
            horarios = []
            for fila in original["horario"]:
                dia, bloque, etiqueta = fila["dia"], fila["bloque"], fila["sala"]
                es_local = fila["campus"] == "Stgo. SJ." or bool(MARCA_SJ.search(texto_busqueda(etiqueta)))
                if solo_en_campus and not es_local:
                    continue
                verificar(type(dia) is int and 0 <= dia < len(DIAS),
                          f"Día inválido en {sigla} P{numero}: {dia}")
                verificar(type(bloque) is int and bloque in bloques,
                          f"Bloque inválido en {sigla} P{numero}: {bloque}")
                horarios.append({
                    "dia": dia, "bloque": bloque, "inicio": bloques[bloque]["inicio"],
                    "fin": bloques[bloque]["fin"], "sala": sala_normalizada(etiqueta, alias),
                    "salaFuente": etiqueta, "campusFuente": fila["campus"],
                    "profesor": fila["profesor"], "tipo": fila["tipo"], "enSanJoaquin": es_local
                })
            if solo_en_campus and not horarios:
                continue
            paralelo = {
                "numero": numero, "profesores": profesores,
                "horario": sorted(horarios, key=lambda h: (h["dia"], h["bloque"], h["salaFuente"]))
            }
            if original["nombre"] != nombre:
                paralelo["nombre"] = original["nombre"]
            grupos.append(paralelo)
        if grupos:
            ramos.append({"sigla": sigla, "nombre": nombre, "paralelos": grupos})
    return ramos


def recorrer(ramos):
    for ramo in ramos:
        for paralelo in ramo["paralelos"]:
            for hora_clase in paralelo["horario"]:
                yield ramo, paralelo, hora_clase


def catalogar_salas(campus, sesiones):
    mapa = campus["mapa"]["salas"]
    configuradas = campus["ubicacionesPorConfirmar"]
    exclusiones = set(campus["exclusiones"])
    revision = campus["revision"]
    excepciones_ks = set(campus["excepcionesSubterraneo"])
    salas = []
    for codigo in sorted(set(sesiones) | set(mapa) | exclusiones | set(revision)):
        filas = sesiones.get(codigo, [])
        ubicacion = codigo if codigo in mapa else codigo[:4] if codigo[:4] in mapa else None
        edificio = codigo[0] if re.match(r"^(?:KS|[A-Z])\d", codigo) else None
        piso, x, y = mapa.get(ubicacion, [None, None, None])
        nota = configuradas.get(codigo, {}).get("nota")
        piso = configuradas.get(codigo, {}).get("piso", piso)
        if codigo in exclusiones:
            estado, motivo = "excluida", "Sala indicada en la lista de exclusión."
        elif re.fullmatch(r"KS\d{3}[A-Z]?", codigo) and codigo not in excepciones_ks:
            estado, motivo = "excluida", "Subterráneo del edificio K."
        elif codigo in revision:
            estado, motivo = "revision", revision[codigo]
        elif not filas:
            estado, motivo = "solo_mapa", "El mapa la identifica y el horario del semestre no registra clases con este código."
        elif (codigo in mapa or codigo in configuradas or codigo in excepciones_ks) and any(
            fila["tipo"] != "Lab" for fila in filas
        ):
            estado, motivo = "aula", None
        else:
            estado, motivo = "revision", "Espacio especial o sala cuyo tipo requiere confirmación."
        sala = {
            "codigo": codigo, "edificio": edificio, "piso": piso, "estado": estado,
            "enMapa": codigo in mapa, "bloquesRegistrados": len(filas),
            "etiquetasFuente": sorted({fila["salaFuente"] for fila in filas}),
        }
        if x is not None:
            sala["punto"] = [x, y]
        if nota:
            sala["notaUbicacion"] = nota
        if motivo:
            sala["motivo"] = motivo
        salas.append(sala)
    return salas


def verificar_y_organizar(origen, semestre, campus, esperado):
    alias = {texto_busqueda(k): v for k, v in campus["alias"].items()}
    sede = campus["sede"]
    bloques = tabla_bloques()
    jornadas = origen[sede]
    catalogos = {jornada: terms[semestre] for jornada, terms in jornadas.items() if terms.get(semestre)}
    verificar(bool(catalogos), f"{sede} no tiene un catálogo para {semestre}")
    oferta = [
        {"jornada": jornada, "ramos": preparar_ramos(catalogo, bloques, alias)}
        for jornada, catalogo in sorted(catalogos.items())
    ]
    adicionales = []
    for sede_origen, jornadas in sorted(origen.items()):
        if sede_origen == sede:
            continue
        for jornada, semestres in sorted(jornadas.items()):
            ramos = preparar_ramos(semestres.get(semestre, {}), bloques, alias, solo_en_campus=True)
            if ramos:
                adicionales.append({"sede": sede_origen, "jornada": jornada, "ramos": ramos})

    ramos = [ramo for turno in oferta for ramo in turno["ramos"]]
    paralelos = [paralelo for ramo in ramos for paralelo in ramo["paralelos"]]
    local = [fila for _, _, fila in recorrer(ramos)]
    externos = [fila for turno in adicionales for _, _, fila in recorrer(turno["ramos"])]
    verificar(len(ramos) == sum(map(len, catalogos.values())), "Faltan ramos del catálogo")
    verificar(len(paralelos) == sum(len(p) for c in catalogos.values() for p in c.values()), "Faltan paralelos")
    verificar(len(local) == sum(
        len(p["horario"]) for c in catalogos.values() for r in c.values() for p in r.values()
    ), "Faltan bloques")
    for cantidad, referencia, campo in zip((len(ramos), len(paralelos)), esperado, ("ramos", "paralelos")):
        verificar(referencia is None or cantidad == referencia,
                  f"{campo}: la fuente trae {cantidad} y el catálogo visible muestra {referencia}")

    por_sala = defaultdict(list)
    ocupaciones = Counter()
    for fila in local + externos:
        if fila["sala"] and fila["enSanJoaquin"]:
            por_sala[fila["sala"]].append(fila)
            ocupaciones[fila["sala"], fila["dia"], fila["bloque"]] += 1
    salas = catalogar_salas(campus, por_sala)
    validacion = {
        "ramos": len(ramos), "paralelos": len(paralelos), "bloques": len(local),
        "paralelosSinHorario": sum(not p["horario"] for p in paralelos),
        "ramosSinHorario": sum(all(not p["horario"] for p in r["paralelos"]) for r in ramos),
        "bloquesSinSala": sum(fila["sala"] is None for fila in local),
        "bloquesSinSalaEnSanJoaquin": sum(fila["sala"] is None and fila["enSanJoaquin"] for fila in local),
        "bloquesFueraDeSede": sum(not fila["enSanJoaquin"] for fila in local),
        "bloquesAdicionales": len(externos), "espaciosConHorario": len(por_sala),
        "aulasConsultables": sum(s["estado"] == "aula" for s in salas),
        "espaciosPorRevisar": sum(s["estado"] == "revision" for s in salas),
        "espaciosSoloMapa": sum(s["estado"] == "solo_mapa" for s in salas),
        "bloquesConOcupacionSimultanea": sum(cantidad > 1 for cantidad in ocupaciones.values()),
    }
    return {
        "version": 1, "sede": sede, "semestre": semestre, "zonaHoraria": campus["zonaHoraria"],
        "dias": DIAS, "bloques": list(bloques.values()), "validacion": validacion,
        "edificios": campus["edificios"], "referencias": campus["referencias"],
        "salas": salas, "oferta": oferta, "ocupacionesAdicionales": adicionales
    }


def escribir_snapshot(ruta, datos):
    # Una entrada por línea conserva diffs manejables para los horarios del semestre.
    def json_linea(valor):
        return json.dumps(valor, ensure_ascii=False, separators=(",", ": "))

    lineas = ["{"]
    for campo, valor in datos.items():
        if campo in ("salas", "bloques"):
            lineas.append(f'  "{campo}": [')
            lineas.append(",\n".join("    " + json_linea(item) for item in valor))
            lineas.append("  ],")
        elif campo in ("oferta", "ocupacionesAdicionales"):
            lineas.append(f'  "{campo}": [')
            turnos = []
            for turno in valor:
                campos = [f'      "{k}": {json_linea(v)},' for k, v in turno.items() if k != "ramos"]
                ramos = ",\n".join("        " + json_linea(ramo) for ramo in turno["ramos"])
                turnos.append("\n".join(["    {", *campos, '      "ramos": [', ramos, "      ]", "    }"]))
            lineas.append(",\n".join(turnos))
            lineas.append("  ],")
        else:
            lineas.append(f'  "{campo}": {json_linea(valor)},')
    lineas[-1] = lineas[-1].removesuffix(",")
    lineas.append("}\n")
    contenido = "\n".join(lineas)
    json.loads(contenido)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=ruta.parent, delete=False) as temporal:
        temporal.write(contenido)
        destino_temporal = Path(temporal.name)
    destino_temporal.replace(ruta)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--semestre", required=True, help="Por ejemplo, 2026-2.")
    parser.add_argument("--revision", required=True, help="SHA completo de la revisión de Horario USM.")
    parser.add_argument("--repo-local", type=Path, help="Clon de Horario USM para importar sin descargar.")
    parser.add_argument("--ramos-esperados", type=int)
    parser.add_argument("--paralelos-esperados", type=int)
    args = parser.parse_args()
    verificar(bool(re.fullmatch(r"\d{4}-[123]", args.semestre)), "Formato de semestre inválido")
    verificar(bool(re.fullmatch(r"[0-9a-f]{40}", args.revision)), "Usa el SHA completo del commit")

    campus = json.loads((DATOS / "campus.json").read_text(encoding="utf-8"))
    raw = archivo_fuente("horario_asignaturas.json", args.revision, args.repo_local)
    metadata = json.loads(archivo_fuente("metadata.json", args.revision, args.repo_local))
    hash_esperado = metadata["files"]["horario_asignaturas.json"]["hash"]
    verificar(hashlib.md5(raw, usedforsecurity=False).hexdigest() == hash_esperado,
              "El archivo de horarios no corresponde a los metadatos de la fuente")
    datos = verificar_y_organizar(json.loads(raw), args.semestre, campus,
                                  (args.ramos_esperados, args.paralelos_esperados))
    datos["fuente"] = {
        "sitio": WEB, "revision": args.revision,
        "archivo": f"{REPO}/blob/{args.revision}/{RUTA_FUENTE}/horario_asignaturas.json",
        "actualizado": datetime.fromtimestamp(metadata["generatedAt"]["unix"], timezone.utc).isoformat(),
        "sha256": hashlib.sha256(raw).hexdigest()
    }
    destino = DATOS / f"horario-{args.semestre}.json"
    escribir_snapshot(destino, datos)
    print(json.dumps(datos["validacion"], ensure_ascii=False, indent=2))
    print(destino.relative_to(DATOS.parents[1]))


if __name__ == "__main__":
    main()
