import subprocess
import shutil
from pathlib import Path

################################################################################
PREFIX = "~/.local"
FIREFOX_NATIVE_HOST_DIR = "~/.mozilla/native-messaging-hosts"


################################################################################
def install_cp(src_file: Path, dest_file: Path):
    print("install", dest_file)

    # Same behavior as the `install` command
    dest_file.unlink(missing_ok=True)
    dest_file.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src_file, dest_file)

def install_write(src_data: str, dest_file: Path):
    print("install", dest_file)

    # Same behavior as the `install` command
    dest_file.unlink(missing_ok=True)
    dest_file.parent.mkdir(parents=True, exist_ok=True)
    dest_file.write_text(src_data)


################################################################################
real_prefix = Path(PREFIX).expanduser().resolve()
real_firefox_native_host_dir = Path(FIREFOX_NATIVE_HOST_DIR).expanduser().resolve()
project_dir = Path(__file__).resolve().parent
native_app_src_dir = project_dir / "native_app"

native_browser_app_dest_bin = real_prefix / "bin/localweb_native.py"
install_cp(native_app_src_dir / "localweb_native.py", native_browser_app_dest_bin)

json_template = (native_app_src_dir / "singlefile_companion.template.json").read_text()
json_final = json_template.replace("__NATIVE_BROWSER_APP_PATH__", str(native_browser_app_dest_bin))
install_write(json_final, real_firefox_native_host_dir / "singlefile_companion.json")
