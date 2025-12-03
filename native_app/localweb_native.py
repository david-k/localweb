#!/usr/bin/env python3

import sys
import json
import struct
import base64
import subprocess
import configparser
import traceback
import base64
import binascii
import datetime
import sqlite3
import logging
from pathlib import Path
from dataclasses import dataclass
from contextlib import closing

DB_SCHEMA = (
"""
create table if not exists entities(
    id integer not null,
    inserted_at datetime not null,

    title text not null,
    url text not null,
    retrieved_at datetime not null,

    constraint PK_entities__id primary key(id),
    constraint UK_entities__url unique(url)
);
""")

class LocalWebUserError(Exception):
    pass

def show_error(msg: str):
    subprocess.run(["notify-send", "-u", "critical", "LocalWeb", msg])

def show_info(msg: str):
    subprocess.run(["notify-send", "LocalWeb", msg])

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

def get_message_from_browser() -> dict:
    rawLength = sys.stdin.buffer.read(4)
    if len(rawLength) == 0:
        sys.exit(0)
    messageLength = struct.unpack('@I', rawLength)[0]
    message = sys.stdin.buffer.read(messageLength).decode('utf-8')
    return json.loads(message)

def send_success_to_browser():
    # It doesn't matter what we send, as long as the length is greater than
    # zero and the payload is valid JSON
    sys.stdout.buffer.write(b"\x04\x00\x00\x00") # length
    sys.stdout.buffer.write(b'"ok"') # payload

def decode_base64(s) -> str:
    try: 
        return base64.b64decode(s, validate=True).decode("utf-8")
    except binascii.Error:
        raise LocalWebUserError("Received invalid filename from SingleFile")

def save_webpage(config: Config, db: sqlite3.Connection, page_data: dict):
    parts = page_data["filename"].split(" ")
    if len(parts) != 3:
        raise LocalWebUserError("Received invalid filename from SingleFile")

    [retrieved_at_str, url, title] = map(decode_base64, parts)
    try:
        retrieved_at = datetime.datetime.fromisoformat(retrieved_at_str)
    except ValueError as e:
        raise LocalWebUserError(e.args[0])

    inserted_at = datetime.datetime.now(datetime.timezone.utc)
    with db:
        cursor = db.cursor()
        try:
            cursor.execute(
                "insert into entities(title, url, retrieved_at, inserted_at) values(?, ?, ?, ?)",
                (title, url, retrieved_at.isoformat(), inserted_at.isoformat())
            )
        except sqlite3.IntegrityError as e:
            error_msg = e.args[0]
            if error_msg == "UNIQUE constraint failed: entities.url":
                raise LocalWebUserError("URL has already been archived")
            else:
                raise e

        entity_id = cursor.lastrowid
        page_path = config.storage_path / f"page_{entity_id}.html"
        page_path.write_text(page_data["content"])

        show_info("Webpage stored successfully")


################################################################################
logger = logging.getLogger(__name__)
try:
    config = read_config()
    logging.basicConfig(filename=config.storage_path / "error.log", level=logging.ERROR)
    db = init_db(config.db_path)

    # sqlite3.Connection does implement the context manager protocol but does
    # not close the connection on exit (it calls commit/rollback instead).
    # `closing()` is a wrapper that actually calls `close()`.
    with closing(db):
        msg = get_message_from_browser()
        if msg.get("method") == "save":
            save_webpage(config, db, msg["pageData"])
        else:
            raise LocalWebUserError("Message from browser is invalid")

        send_success_to_browser()

except LocalWebUserError as e:
    show_error(e.args[0])

except Exception as e:
    logger.error("Uncaught exception", exc_info=e)

    error_msg = "".join(traceback.format_exception(e))
    show_error("".join(traceback.format_exception(e)))
