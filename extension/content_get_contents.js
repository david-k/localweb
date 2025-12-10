(() => {
	if(document.contentType === "text/html") {
		const options = {
			removeHiddenElements: true,
			removeUnusedStyles: true,
			removeUnusedFonts: true,
			removeImports: true,
			blockScripts: true,
			blockAudios: true,
			blockVideos: true,
			compressHTML: true,
			removeAlternativeFonts: true,
			removeAlternativeMedias: true,
			removeAlternativeImages: true,
			groupDuplicateImages: true
		};
		return extension.getPageData(options).then(page_data => page_data.content);
	} else {
		return Promise.reject("Expected HTML page");
	}
})();
