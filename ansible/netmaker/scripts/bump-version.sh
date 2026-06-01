#!/bin/bash
# Script to bump version in both galaxy.yml and pyproject.toml
# Usage: ./scripts/bump-version.sh <new_version>
# Example: ./scripts/bump-version.sh 1.1.0

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <new_version>"
    echo "Example: $0 1.1.0"
    exit 1
fi

NEW_VERSION="$1"

# Validate version format (semantic versioning)
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Error: Version must be in format X.Y.Z (e.g., 1.1.0)"
    exit 1
fi

# Get current versions
GALAXY_VERSION=$(grep '^version:' galaxy.yml | awk '{print $2}')
PYPROJECT_VERSION=$(grep '^version = ' pyproject.toml | cut -d'"' -f2)

echo "Current versions:"
echo "  galaxy.yml: $GALAXY_VERSION"
echo "  pyproject.toml: $PYPROJECT_VERSION"
echo ""
echo "New version: $NEW_VERSION"
echo ""

# Ask for confirmation
read -p "Update both files to version $NEW_VERSION? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Update galaxy.yml
sed -i "s/^version: .*/version: $NEW_VERSION/" galaxy.yml
echo "✓ Updated galaxy.yml"

# Update pyproject.toml
sed -i "s/^version = .*/version = \"$NEW_VERSION\"/" pyproject.toml
echo "✓ Updated pyproject.toml"

echo ""
echo "Version bumped to $NEW_VERSION"
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff galaxy.yml pyproject.toml"
echo "  2. Commit changes: git add galaxy.yml pyproject.toml && git commit -m 'Bump version to $NEW_VERSION'"
echo "  3. Push to GitHub: git push origin main"
echo "  4. GitHub Actions will automatically publish to Ansible Galaxy"
