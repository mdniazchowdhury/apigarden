# APIGarden v1.9.1

## Daraz live JSON extraction fix

- Added a Daraz-specific product extractor that does not depend on one generated CSS class name.
- Detects live Daraz product links, names, prices, images and product URLs from the rendered search-result page.
- Added DOM fallback extraction by climbing from product links to the smallest price/image container.
- Added JSON-LD Product extraction as an additional structured-data fallback.
- Added delayed polling for dynamic catalog pages. If the browser opens the result page before product cards are rendered, APIGarden waits briefly and retries instead of immediately exporting an empty `results` array.
- A zero-result extraction is now reported as `no_results_captured` rather than incorrectly reporting `success`.
- Existing Voice API, Run API, Save API and Download JSON behavior remains unchanged.
