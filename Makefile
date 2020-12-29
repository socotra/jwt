DOCKER_IMAGE_TAG := hagemt/socotra-base-image:nodejs-command-line

default: demo
.PHONY: default

clean:
	git clean -dix
.PHONY: clean

demo:
	npx @socotra/jwt --debug inspect --login
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
	docker run --init --interactive --user=node --rm --tty \
		-- "$(DOCKER_IMAGE_TAG)" npx @socotra/jwt --debug inspect --login
	@docker push -- "$(DOCKER_IMAGE_TAG)"
.PHONY: test
