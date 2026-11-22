COMPOSE ?= docker compose
.DEFAULT_GOAL := help

.PHONY: help build up stop remove
help:
	@printf '%s\n' 'make build   Build the application image' \
		'make up      Start the built image and wait for health' \
		'make stop    Stop the container' \
		'make remove  Remove the container and network, preserving the audit volume'

build:
	$(COMPOSE) build

up:
	$(COMPOSE) up -d --no-build --wait

stop:
	$(COMPOSE) stop

remove:
	$(COMPOSE) down
