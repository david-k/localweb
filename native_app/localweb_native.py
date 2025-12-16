#!/usr/bin/env python3

import sys
import json
import struct
import base64
import configparser
import traceback
import base64
import binascii
import datetime
import sqlite3
import logging
import subprocess
from typing import Any
from pathlib import Path
from dataclasses import dataclass
from contextlib import closing

MIME_TYPE_EXT = {
    "audio/aac": ".aac",
    "application/x-abiword": ".abw",
    "image/apng": ".apng",
    "application/x-freearc": ".arc",
    "image/avif": ".avif",
    "video/x-msvideo": ".avi",
    "application/vnd.amazon.ebook": ".azw",
    "application/octet-stream": ".bin",
    "image/bmp": ".bmp",
    "application/x-bzip": ".bz",
    "application/x-bzip2": ".bz2",
    "application/x-cdf": ".cda",
    "application/x-csh": ".csh",
    "text/css": ".css",
    "text/csv": ".csv",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-fontobject": ".eot",
    "application/epub+zip": ".epub",
    "application/gzip": ".gz",
    "image/gif": ".gif",
    "text/html": ".html",
    "image/vnd.microsoft.icon": ".ico",
    "text/calendar": ".ics",
    "application/java-archive": ".jar",
    "image/jpeg": ".jpeg",
    "text/javascript": ".js",
    "application/json": ".json",
    "application/ld+json": ".jsonld",
    "text/markdown": ".md",
    "audio/midi": ".midi",
    "audio/x-midi": ".midi",
    "text/javascript": ".mjs",
    "audio/mpeg": ".mp3",
    "video/mp4": ".mp4",
    "video/mpeg": ".mpeg",
    "application/vnd.apple.installer+xml": ".mpkg",
    "application/vnd.oasis.opendocument.presentation": ".odp",
    "application/vnd.oasis.opendocument.spreadsheet": ".ods",
    "application/vnd.oasis.opendocument.text": ".odt",
    "audio/ogg": ".oga",
    "video/ogg": ".ogv",
    "application/ogg": ".ogx",
    "audio/ogg": ".opus",
    "font/otf": ".otf",
    "image/png": ".png",
    "application/pdf": ".pdf",
    "application/x-httpd-php": ".php",
    "application/vnd.ms-powerpoint": ".ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "application/vnd.rar": ".rar",
    "application/rtf": ".rtf",
    "application/x-sh": ".sh",
    "image/svg+xml": ".svg",
    "application/x-tar": ".tar",
    "<code>.tiff</code>, image/tiff": ".tif",
    "video/mp2t": ".ts",
    "font/ttf": ".ttf",
    "text/plain": ".txt",
    "application/vnd.visio": ".vsd",
    "audio/wav": ".wav",
    "audio/webm": ".weba",
    "video/webm": ".webm",
    "application/manifest+json": ".webmanifest",
    "image/webp": ".webp",
    "font/woff": ".woff",
    "font/woff2": ".woff2",
    "application/xhtml+xml": ".xhtml",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/xml": ".xml",
    "text/xml": ".xml",
    "application/vnd.mozilla.xul+xml": ".xul",
    "application/zip": ".zip",
    "application/x-zip-compressed": ".zip",
    "video/3gpp": ".3gp",
    "audio/3gpp": ".3gp",
    "video/3gpp2": ".3g2",
    "audio/3gpp2": ".3g2",
    "application/x-7z-compressed": ".7z",
}

DB_SCHEMA = (
"""
create table if not exists entities(
    id integer not null,
    inserted_at datetime not null,
    inserted_by text not null,

    title text not null,
    url text not null,
    mime_type text not null,
    retrieved_at datetime not null,

    constraint PK_entities__id primary key(id),
    constraint UK_entities__url unique(url)
);
""")

class LocalWebUserError(Exception):
    pass

@dataclass
class Config:
    storage_path: Path
    db_path: Path

def parse_config_value(parser: configparser.ConfigParser, key: str) -> str:
    value = parser.get(configparser.UNNAMED_SECTION, key, fallback=None)
    if value is None:
        raise LocalWebUserError(f"Loading config failed: no value for \"{key}\"")

    return value

def read_config() -> Config:
    config_path = Path.home() / ".localweb"
    if not config_path.exists():
        raise LocalWebUserError("Configuration file not found")

    parser = configparser.ConfigParser(allow_unnamed_section=True)
    parser.read(config_path)
    config = Config(
        storage_path = Path(parse_config_value(parser, "storage_path")).expanduser(),
        db_path = Path(parse_config_value(parser, "db_path")).expanduser(),
    )

    if not config.storage_path.exists():
        raise LocalWebUserError(f"Storage path \"{config.storage_path}\" does not exist")

    return config

def init_db(db_path: Path) -> sqlite3.Connection:
    db = sqlite3.connect(db_path, autocommit=False)
    db.execute("PRAGMA foreign_keys = ON")
    db.executescript(DB_SCHEMA,)
    return db

def show_error(msg: str):
    subprocess.run(["notify-send", "-u", "critical", "LocalWeb", msg])

def show_info(msg: str):
    subprocess.run(["notify-send", "LocalWeb", msg])

def get_message_from_browser() -> Any:
    rawLength = sys.stdin.buffer.read(4)
    if len(rawLength) == 0:
        sys.exit(0)
    messageLength = struct.unpack('=I', rawLength)[0]
    message = sys.stdin.buffer.read(messageLength).decode('utf-8')
    return json.loads(message)

def send_message_to_browser(msg: Any):
    encoded_msg = json.dumps(msg).encode("utf-8")
    encoded_length = struct.pack("=I", len(encoded_msg))
    sys.stdout.buffer.write(encoded_length)
    sys.stdout.buffer.write(encoded_msg)
    sys.stdout.flush()

def decode_base64(s) -> str:
    try: 
        return base64.b64decode(s, validate=True).decode("utf-8")
    except binascii.Error:
        raise LocalWebUserError("Received invalid filename from SingleFile")

def dict_disjoint_union(a: dict, b: dict) -> dict:
    if not a.keys().isdisjoint(b):
        raise Exception("Dictionaries not disjoint")

    return a | b

def db_datetime_str(d: datetime.datetime) -> str:
    return d.strftime("%Y-%m-%d %H:%M:%S")

def save_webpage(
    config: Config,
    db: sqlite3.Connection,
    page: dict,
    sender: str
):
    now_iso = db_datetime_str(datetime.datetime.now(datetime.timezone.utc))
    with db:
        cursor = db.cursor()
        try:
            cursor.execute(
                """insert into entities(
                    title, url, mime_type, retrieved_at, inserted_at, inserted_by
                )
                values(?, ?, ?, ?, ?, ?)""",
                (page["title"], page["url"], page["mime_type"], now_iso, now_iso, sender)
            )
        except sqlite3.IntegrityError as e:
            error_msg = e.args[0]
            if error_msg == "UNIQUE constraint failed: entities.url":
                raise LocalWebUserError("URL has already been archived")
            else:
                raise e

        entity_id = cursor.lastrowid
        file_ext = MIME_TYPE_EXT.get(page["mime_type"], "")
        page_path = config.storage_path / f"page_{entity_id}{file_ext}"
        if isinstance(page["contents"], str):
            page_path.write_text(page["contents"])
        else:
            page_path.write_bytes(page["contents"])

        return {"timestamp": now_iso}

def check_if_archived(config: Config, db: sqlite3.Connection, url: str) -> dict|None:
    with db:
        cursor = db.cursor()
        snapshot = cursor.execute("select retrieved_at from entities where url = ?", (url,)).fetchone()
        if not snapshot:
            return None

        return {"timestamp": snapshot[0]}


def handle_message(config: Config, db: sqlite3.Connection, msg: dict):
    match msg["sender"]:
        case "singlefile":
            if msg.get("method") == "save":
                page = {
                    "url": msg["pageData"]["url"],
                    "title": msg["pageData"]["title"],
                    "mime_type": "text/html",
                    "contents": msg["pageData"]["content"],
                }
                return save_webpage(config, db, page, "singlefile_browser_ext")
            else:
                raise LocalWebUserError("Invalid message from SingleFile browser extension")

        case "localweb":
            if msg.get("action") == "save":
                page = {
                    "url": msg["url"],
                    "title": msg["title"],
                    "mime_type": msg["mime_type"],
                    "contents": base64.b64decode(msg["contents"]) if msg["is_base64"] else msg["contents"],
                }
                return save_webpage(config, db, page, "localweb_browser_ext")
            elif msg.get("action") == "query":
                return {"archived": check_if_archived(config, db, msg["url"])}
            else:
                raise LocalWebUserError("Invalid message from LocalWeb browser extension")

        case _:
            raise LocalWebUserError("Invalid message sender")


################################################################################
logger = logging.getLogger(__name__)
show_notifications = False
try:
    config = read_config()
    logging.basicConfig(
        format="[%(asctime)s] %(levelname)s:%(name)s:%(message)s",
        filename=config.storage_path / "error.log",
        level=logging.INFO
    )
    db = init_db(config.db_path)

    # sqlite3.Connection does implement the context manager protocol but does
    # not close the connection on exit (it calls commit/rollback instead).
    # `closing()` is a wrapper that actually calls `close()`.
    with closing(db):
        msg = get_message_from_browser()
        if "sender" not in msg:
            msg["sender"] = "singlefile"
            show_notifications = True

        result = handle_message(config, db, msg)
        if show_notifications:
            show_info("Success!")

        send_message_to_browser(dict_disjoint_union({"status": "ok"}, result))

except LocalWebUserError as e:
    if show_notifications:
        show_error(e.args[0])

    send_message_to_browser({
        "status": "error",
        "info": e.args[0],
    })

except Exception as e:
    logger.error("Uncaught exception", exc_info=e)
    error_msg = "".join(traceback.format_exception_only(e))
    if show_notifications:
        show_error(error_msg)

    send_message_to_browser({
        "status": "error",
        "info": error_msg
    })
