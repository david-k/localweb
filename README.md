# LocalWeb

LocalWeb is a browser extensions that helps you store web resources (web pages, PDFs, images, ..., basically anything with a URL) locally on your computer. Also, dumps all the information in a SQLite database so you can stay organized.

LocalWeb is implemented as a wrapper around [SingleFile](https://github.com/gildas-lormeau/SingleFile), adding database support and the ability to handle non-HTML content.

## Installation

1. Install the SingleFile browser extension. Then, change the following settings:

   - `File name`: Change `template` to the following:

     ```
     %encode-base64<{datetime-iso}> %encode-base64<{url-href}> %encode-base64<{page-title}>
     ```

     Also, set `max length` to some large value, e.g. 30000.

   - `Destination`: Choose `save with SingleFile Companion`

2. Install the LocalWeb browser extension.

3. Run `python install.py`. This installs a Python app that actually writes the downloaded web pages to disk and writes some meta data (title, url, date) into a SQLite database.

4. Create a file `~/.localweb` and adjust the following to your needs:

   ```
   db_path = ~/LocalWeb/index.sqlite
   storage_path = ~/LocalWeb/webpages
   ```
