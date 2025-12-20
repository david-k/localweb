import sqlite3
from pathlib import Path
from contextlib import closing
from flask import (
    Flask,
    Response,
    render_template,
    url_for,
    send_file,
    abort,
)

from .common import (
    Config,
    init_db,
)

def main(config: Config, **kwargs):
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
                abort(404, "Object not found")

            return send_file(config.storage_path / obj["filename"])

    @app.route("/delete/<int:object_id>", methods=("POST",))
    def delete_object(object_id):
        with init_db(config.db_path) as db:
            db.row_factory = sqlite3.Row
            obj = db.execute("select * from objects where id = ?", (object_id,)).fetchone()
            if not obj:
                abort(404, "Object not found")

            Path(config.storage_path / obj["filename"]).unlink(missing_ok=True)
            db.execute("delete from objects where id = ?", (obj["id"],))

            return Response(status=200)


    app.run(**kwargs)
