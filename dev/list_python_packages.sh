#!/bin/bash

# Parse command line arguments
while [ "$1" != "" ]; do
    case $1 in
        --project_name )        shift
                                project_name=$1
                                ;;
    esac
    shift
done

# Check if project_name is provided
if [ -z "$project_name" ]; then
    echo "Error: --project_name flag is required."
    exit 1
fi

# Run pip list and parse the output
pip_list=$(pip list --format=json)
packages=$(echo $pip_list | jq -r '.[] | .name')

# Initialize JSON array
json_array="["

# Iterate over packages and get details
for package in $packages; do
    package_info=$(pip show -f $package)

    # Extract required fields
    name=$(echo "$package_info" | grep "Name:" | awk '{print $2}')
    version=$(echo "$package_info" | grep "Version:" | awk '{print $2}')
    files=$(echo "$package_info" | sed -n '/Files:/,/^[^ ]/p' | tail -n +2 | sed 's/^[ \t]*//;s/[ \t]*$//' | jq -R -s -c 'split("\n")[:-1]')

    # Construct JSON object
    json_object="{\"name\": \"$name\", \"version\": \"$version\", \"files\": $files}"
    json_array+="$json_object," 
done

# Remove trailing comma and close JSON array
json_array="${json_array%,}]"

# Construct the filename using the project name
output_file="${project_name}_env.json"

# Write the JSON array to the file
echo $json_array > "$output_file"

# Echo a message indicating completion
echo "Environment details written to $output_file"
