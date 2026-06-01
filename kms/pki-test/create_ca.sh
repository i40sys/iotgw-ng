#!/bin/bash
# Script to create a Root CA using Cosmian KMS REST API

KMS_URL="http://localhost:9998"

echo "=== Creating Root CA Certificate ==="

# Create a new CA certificate
# Using KMIP-compliant JSON request
CA_RESPONSE=$(curl -s -X POST "${KMS_URL}/kmip/2_1" \
  -H "Content-Type: application/json" \
  -d '{
    "tag": "Create",
    "type": "Structure",
    "value": [
      {
        "tag": "ObjectType",
        "type": "Enumeration",
        "value": "Certificate"
      },
      {
        "tag": "Attributes",
        "type": "Structure",
        "value": [
          {
            "tag": "CryptographicAlgorithm",
            "type": "Enumeration",
            "value": "RSA"
          },
          {
            "tag": "CryptographicLength",
            "type": "Integer",
            "value": 2048
          },
          {
            "tag": "CertificateAttributes",
            "type": "Structure",
            "value": [
              {
                "tag": "SubjectDN",
                "type": "TextString",
                "value": "CN=Test Root CA,O=Cosmian Test,C=ES"
              }
            ]
          }
        ]
      }
    ]
  }')

echo "CA Response:"
echo "$CA_RESPONSE" | jq .

# Extract the CA unique identifier
CA_ID=$(echo "$CA_RESPONSE" | jq -r '.value[] | select(.tag == "UniqueIdentifier") | .value')

echo ""
echo "Root CA created with ID: $CA_ID"
echo "$CA_ID" > ca_id.txt

echo ""
echo "=== Root CA creation complete ==="
