variable "region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "eu-west-1"
}

variable "profile" {
  description = "Local AWS CLI profile to authenticate with."
  type        = string
  default     = "cobra"
}

variable "instance_type" {
  description = "EC2 instance type. t3.medium gives 2 vCPU / 4 GB — comfortable for the embedder + Chroma."
  type        = string
  default     = "t3.medium"
}

variable "ssh_cidr" {
  description = "CIDR allowed to SSH (port 22). Lock this to your IP for production."
  type        = string
  default     = "0.0.0.0/0"
}

variable "project" {
  description = "Name tag applied to all resources."
  type        = string
  default     = "glyph"
}
