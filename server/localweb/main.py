import argparse

def main():
    parser = argparse.ArgumentParser(prog='localweb', allow_abbrev=False)
    subparsers = parser.add_subparsers(dest="subcommand", required=True)
    native_host_parser = subparsers.add_parser(
        "native-host",
        help="Allows communication with browser extension",
        allow_abbrev=False,
    )
    server_parser = subparsers.add_parser(
        "serve",
        help="Simple server to browse archived webpages",
        allow_abbrev=False,
    )
    server_parser.add_argument("--debug", action="store_true")

    args = parser.parse_args()
    if args.subcommand == "native-host":
        from . import native_host
        native_host.main()
    elif args.subcommand == "serve":
        from . import server
        server.main(debug=args.debug)


if __name__ == "__main__":
    main()
