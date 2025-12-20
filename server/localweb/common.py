import sqlite3
import configparser
from pathlib import Path
from dataclasses import dataclass

DB_SCHEMA = (
"""
create table if not exists objects(
    id integer not null,
    inserted_at text not null, -- DATETIME
    inserted_by text not null,

    title text not null,
    url text not null,
    mime_type text not null,
    filename text,
    retrieved_at text not null, -- DATETIME

    constraint PK_objects__id primary key(id),
    constraint UK_objects__url unique(url)
) STRICT;
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
    db = sqlite3.connect(
        db_path,
        autocommit=False,
        detect_types=sqlite3.PARSE_DECLTYPES
    )
    db.execute("PRAGMA foreign_keys = ON")
    db.executescript(DB_SCHEMA)
    return db
