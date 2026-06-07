terraform {
  required_version = ">= 1.6"

  # Remote state in S3 (versioned + encrypted) with a DynamoDB lock table, so the state is not
  # trapped on one laptop and two applies can't corrupt it. Auth comes from the usual AWS
  # credential chain — set AWS_PROFILE (e.g. the deploy profile) before `terraform init`.
  backend "s3" {
    bucket         = "glyph-tfstate-490872068312"
    key            = "glyph/terraform.tfstate"
    region         = "eu-west-1"
    dynamodb_table = "glyph-tflock"
    encrypt        = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }
}

provider "aws" {
  region  = var.region
  profile = var.profile
}
