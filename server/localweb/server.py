import sqlite3
from contextlib import closing
from flask import (
    Flask,
    render_template,
    url_for,
    send_file,
)

from .common import (
    read_config,
    init_db,
)

def main():
    config = read_config()
    app = Flask("localweb-server")

    @app.route("/")
    def index():
        with init_db(config.db_path) as db:
            db.row_factory = sqlite3.Row
            objects = db.execute("select * from objects order by inserted_at desc").fetchall()
            return render_template("index.html", objects=objects)

    @app.route("/view/<int:object_id>")
    def view_object(object_id):
        with init_db(config.db_path) as db:
            db.row_factory = sqlite3.Row
            obj = db.execute("select * from objects where id = ?", (object_id,)).fetchone()
            if not obj:
                raise Exception("Object not found")

            return send_file(config.storage_path / obj["filename"])


    app.run()
