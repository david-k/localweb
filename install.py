import subprocess
import shutil
from dataclasses import dataclass
from pathlib import Path

################################################################################
PREFIX = "~/.local"
FIREFOX_NATIVE_HOST_DIR = "~/.mozilla/native-messaging-hosts"


################################################################################
@dataclass
class Config:
    project_dir: Path
    install_prefix_dir: Path
    firefox_native_host_dir: Path

    def project_native_app_dir(self) -> Path:
        return self.project_dir / "native_app"

    def installed_native_app_filename(self) -> Path:
        return self.install_prefix_dir / "bin/localweb_native.py"

def install_native_host_manifest(src_basename: str, config: Config):
    json_template = (config.project_native_app_dir() / src_basename).read_text()
    json_final = json_template.replace("__NATIVE_BROWSER_APP_PATH__", str(config.installed_native_app_filename()))

    dest_basename = src_basename.replace(".template", "")
    install_write(json_final, config.firefox_native_host_dir / dest_basename)

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
config = Config(
    project_dir = Path(__file__).resolve().parent,
    install_prefix_dir = Path(PREFIX).expanduser().resolve(),
    firefox_native_host_dir = Path(FIREFOX_NATIVE_HOST_DIR).expanduser().resolve(),
)

install_cp(config.project_native_app_dir() / "localweb_native.py", config.installed_native_app_filename())
install_native_host_manifest("localweb_companion.template.json", config)
install_native_host_manifest("singlefile_companion.template.json", config)
