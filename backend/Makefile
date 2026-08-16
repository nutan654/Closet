.PHONY: run build test test-verbose lint tidy migrate-check docker-up docker-down swagger

run: ## Run the API locally (needs DATABASE_URL/JWT_SECRET set or a .env file)
	go run ./cmd/api

build: ## Compile the binary to bin/api
	go build -o bin/api ./cmd/api

test: ## Run the full test suite
	go test ./...

test-verbose: ## Run tests with verbose output and coverage
	go test -v -cover ./...

lint: ## Vet + gofmt check (run before every commit)
	go vet ./...
	@test -z "$$(gofmt -l .)" || (echo "gofmt found unformatted files:" && gofmt -l . && exit 1)

tidy: ## Sync go.mod/go.sum with actual imports
	go mod tidy

docker-up: ## Start Postgres + the API via docker-compose
	docker compose up --build

docker-down: ## Stop and remove the docker-compose stack
	docker compose down -v

swagger: ## Regenerate docs/swagger.json from the @-annotations in internal/handlers
	@which swag > /dev/null || (echo "install swag first: go install github.com/swaggo/swag/cmd/swag@latest" && exit 1)
	swag init -g cmd/api/main.go -o docs --parseDependency --parseInternal
