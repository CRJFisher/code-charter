# Start from the latest golang base image
FROM golang:latest

# Add Maintainer Info
LABEL maintainer="Chuck Fisher <crjfisher@gmail.com>"

# Set the Current Working Directory inside the container
WORKDIR /app

# Copy go mod and sum files
COPY go.mod ./
COPY go.sum ./

# Download all dependencies. Dependencies will be cached if the go.mod and go.sum files are not changed
RUN go mod download

COPY ./cmd ./cmd

# Build the Go app
RUN go build -o main ./cmd/main.go

# Command to run the executable
ENTRYPOINT ["./main"]