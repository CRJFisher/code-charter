#!/bin/bash

cd ../

docker build -t crjfisher/codecharter-detectcallgraphs -f docker/call-graph-detector/Dockerfile.distroless .

docker push crjfisher/codecharter-detectcallgraphs
