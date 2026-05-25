  function translateText(text, targetLanguage) {
    const trimmedText = text.trim();
    const cacheKey = `${targetLanguage}:${trimmedText}`;
    const cachedText = translationCache.get(cacheKey);
    if (cachedText) {
      return Promise.resolve(cachedText);
    }

    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", "auto");
    url.searchParams.set("tl", targetLanguage);
    url.searchParams.set("dt", "t");
    url.searchParams.set("q", trimmedText);

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: url.toString(),
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`Google Translate returned HTTP ${response.status}`));
            return;
          }

          try {
            const payload = JSON.parse(response.responseText);
            const translatedText = payload?.[0]?.map((part) => part?.[0] ?? "").join("").trim();
            if (!translatedText) {
              reject(new Error("Google Translate returned an empty translation"));
              return;
            }

            translationCache.set(cacheKey, translatedText);
            resolve(translatedText);
          } catch (error) {
            reject(error);
          }
        },
        onerror() {
          reject(new Error("Google Translate request failed"));
        },
      });
    });
  }
