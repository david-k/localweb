# LocalWeb

LocalWeb is a browser extensions that helps you store web resources (web pages, PDFs, images, ..., basically anything with a URL) locally on your computer. Also, dumps additional information in a SQLite database so you can stay organized.

Internally, LocalWeb makes use of [SingleFile](https://github.com/gildas-lormeau/SingleFile) to convert web pages to single HTML files.

## Installation

Currently, only Firefox/Linux is supported.

1. Clone the repo with `git clone https://github.com/david-k/localweb.git --recurse-submodules`

2. Install the LocalWeb browser extension.

   The easiest way is to visit `about:debugging` → "This Firefox" → "Load Temporary Add-on..." and select `extension/manifest.json`.

3. Run `python install.py`. This installs a Python app that actually writes the downloaded web pages to disk and writes some meta data (title, url, date) into a SQLite database.

4. Create a file `~/.localweb` and adjust the following to your needs:

   ```
   db_path = ~/LocalWeb/index.sqlite
   storage_path = ~/LocalWeb/webpages
   ```
