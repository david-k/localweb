import argparse

def main():
    parser = argparse.ArgumentParser(prog='localweb')
    subparsers = parser.add_subparsers(dest="subcommand", required=True)
    native_host_parser = subparsers.add_parser(
        "native-host",
        help="Allows communication with browser extension"
    )
    server_parser = subparsers.add_parser(
        "serve",
        help="Simple server to browse archived webpages"
    )

    args = parser.parse_args()
    if args.subcommand == "native-host":
        from . import native_host
        native_host.main()
    elif args.subcommand == "serve":
        from . import server
        server.main()


if __name__ == "__main__":
    main()
