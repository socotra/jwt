DOCKER_IMAGE_TAG := hagemt/socotra-base-image:nodejs-command-line

default: demo
.PHONY: default

clean:
	git clean -dix
.PHONY: clean

demo: test
	npx @socotra/jwt -- inspect "$(shell jwt)"
.PHONY: demo

node_modules: package.json
	npm install

publish: node_modules
	npm publish
.PHONY: publish

sane: node_modules
	[ -x "$(shell command -v docker)" ]
.PHONY: sane

test: sane
	docker build "--tag=$(DOCKER_IMAGE_TAG)" -- .
	docker run --rm -it -- "$(DOCKER_IMAGE_TAG)"
	@docker push "$(DOCKER_IMAGE_TAG)" # demo
.PHONY: test
