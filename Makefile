# cc-switch — cross-platform Make entry points.
#
# The real logic lives in scripts/*.js (Node is cross-platform).
# macOS / Linux:  make install
# Windows:        use the npm scripts instead (no `make` needed):
#                   npm run setup      (== make install)
#                   npm run teardown   (== make uninstall)
#                   npm test           (== make test)

NODE ?= node

.PHONY: install uninstall test clean help

install:           ## Install deps, register global `cc-switch`, run init
	$(NODE) scripts/install.js

uninstall:         ## Remove the global `cc-switch` command (keeps ~/.cc-switch)
	$(NODE) scripts/uninstall.js

test:              ## Run the test suite
	npm test

clean:             ## Remove node_modules and coverage
	rm -rf node_modules coverage

help:              ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?##' $(MAKEFILE_LIST) | \
		awk 'BEGIN { FS = ":.*?## " } { printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2 }'
