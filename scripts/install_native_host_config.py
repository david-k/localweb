import sys
import subprocess
from pathlib import Path

FIREFOX_NATIVE_HOST_DIR = "~/.mozilla/native-messaging-hosts"

def install_write(src_data: str, dest_file: Path):
    print("install", dest_file)

    # Same behavior as the `install` command
    dest_file.unlink(missing_ok=True)
    dest_file.parent.mkdir(parents=True, exist_ok=True)
    dest_file.write_text(src_data)


if len(sys.argv) != 3:
    print(f"Usage: {Path(__file__).name} NATIVE_HOST_JSON NATIVE_HOST_BIN")
    sys.exit(1)

json_template_filename = Path(sys.argv[1]).expanduser().resolve()
native_host_app_filename = Path(sys.argv[2]).expanduser().resolve()

json_template = json_template_filename.read_text()
json_final = json_template.replace("__NATIVE_BROWSER_APP_PATH__", str(native_host_app_filename))

dest_basename = json_template_filename.name.replace(".template", "")
dest_dir = Path(FIREFOX_NATIVE_HOST_DIR).expanduser().resolve()
install_write(json_final, dest_dir / dest_basename)
