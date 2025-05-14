
#!/bin/bash

echo "Enter the main folder location (without a trailing /):"
read main_folder

main_folder="$main_folder/"

if [[ ! -d "$main_folder" ]]; then
    echo "Error: Directory does not exist."
    exit 1
fi

zip_files=($(find "$main_folder" -maxdepth 1 -name "*.zip" | sort))

if [[ ${#zip_files[@]} -eq 0 ]]; then
    echo "Error: No zip files found in the given folder."
    exit 1
fi

echo "Found the following zip files:"
for i in "${!zip_files[@]}"; do
    zip_name=$(basename "${zip_files[$i]}")
    echo "$((i+1)): $zip_name"
done

echo "Enter the number of the zip file you want to restore:"
read zip_choice

if [[ ! "$zip_choice" =~ ^[0-9]+$ ]] || (( zip_choice < 1 )) || (( zip_choice > ${#zip_files[@]} )); then
    echo "Invalid choice. Please enter a valid Number from the list."
    exit 1
fi

selected_zip="${zip_files[$((zip_choice-1))]}"
zip_name=$(basename "$selected_zip" .zip)

echo "You selected: $selected_zip"

mkdir -p dump/"$zip_name"

echo "Extracting $selected_zip to dump/$zip_name..."
unzip "$selected_zip" -d dump/"$zip_name"

if [[ $? -ne 0 ]]; then
    echo "Error: Failed to extract the zip file."
    exit 1
fi

echo "Running mongorestore command for the extracted dump..."
mongorestore --drop

if [[ $? -ne 0 ]]; then
    echo "Error: Failed to restore MongoDB dump."
    exit 1
else
    echo "MongoDB restore completed successfully."
fi

  