# Controls on the Terraform state bucket itself (task-143). The bucket and its
# dedicated S3 user were created once by hand (task-142); this module owns the
# protections around them. Its own state (no secrets: policies/config only)
# lives in the same bucket under ovh/bootstrap.tfstate.
#
# Decision (task-143): the platform state keeps the k8s Secrets in plaintext,
# so access to this bucket is the control:
#   - only the dedicated user `iotgw-ng-terraform-state` can use it — OVH S3
#     has no bucket policies (NotImplemented); buckets belong to their owner and
#     other project S3 users are denied by default (verified with a probe user);
#   - that user's S3 policy is scoped to this bucket only (least privilege);
#   - SSE (AES256) at rest, versioning, noncurrent versions expire after 30 d.
terraform {
  required_version = ">= 1.9"

  required_providers {
    ovh = {
      source  = "ovh/ovh"
      version = "~> 2.0"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket                      = "iotgw-ng-tfstate-28f191"
    key                         = "ovh/bootstrap.tfstate"
    region                      = "gra"
    endpoints                   = { s3 = "https://s3.gra.io.cloud.ovh.net" }
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
    use_path_style              = true
    use_lockfile                = true
  }
}

provider "ovh" {}

# OVH Object Storage speaks S3; credentials = the dedicated user (tf.sh env).
provider "aws" {
  region                      = "us-east-1" # placeholder; the endpoint decides
  skip_credentials_validation = true
  skip_region_validation      = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
  s3_use_path_style           = true
  endpoints {
    s3 = "https://s3.gra.io.cloud.ovh.net"
  }
}

variable "service_name" {
  type    = string
  default = "28f191dfa5eb430c8e9928711016fbed"
}

variable "state_bucket" {
  type    = string
  default = "iotgw-ng-tfstate-28f191"
}

variable "state_user_id" {
  description = "OVH project user iotgw-ng-terraform-state (objectstore_operator)"
  type        = string
  default     = "815403"
}

variable "noncurrent_days" {
  type    = number
  default = 30
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = var.state_bucket
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = var.state_bucket
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = var.state_bucket
  rule {
    id     = "expire-noncurrent-30d"
    status = "Enabled"
    filter {
      prefix = ""
    }
    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_days
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# Least privilege: the state user may act on this bucket only.
resource "ovh_cloud_project_user_s3_policy" "state" {
  service_name = var.service_name
  user_id      = var.state_user_id
  policy = jsonencode({
    Statement = [{
      Sid    = "TerraformStateBucketOnly"
      Effect = "Allow"
      Action = ["s3:*"]
      Resource = [
        "arn:aws:s3:::${var.state_bucket}",
        "arn:aws:s3:::${var.state_bucket}/*",
      ]
    }]
  })
}
