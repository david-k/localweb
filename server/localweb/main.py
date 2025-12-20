import argparse
import logging
import sys
from .common import read_config

def main():
    parser = argparse.ArgumentParser(prog='localweb', allow_abbrev=False)
    subparsers = parser.add_subparsers(dest="subcommand", required=True)

    native_host_parser = subparsers.add_parser(
        "native-host",
        help="Allows communication with browser extension",
        allow_abbrev=False,
    )
    native_host_parser.add_argument("args", nargs="*") # The browser passes some information that we currently ignore

    server_parser = subparsers.add_parser(
        "serve",
        help="Simple server to browse archived webpages",
        allow_abbrev=False,
    )
    server_parser.add_argument("--debug", action="store_true")

    args = parser.parse_args()

    config = read_config()
    logging.basicConfig(
        format="[%(asctime)s] %(levelname)s:%(name)s:%(message)s",
        filename=config.storage_path / "error.log",
        level=logging.INFO
    )

    if args.subcommand == "native-host":
        from . import native_host
        native_host.main(config)
    elif args.subcommand == "serve":
        from . import server
        server.main(config, debug=args.debug)


if __name__ == "__main__":
    main()
