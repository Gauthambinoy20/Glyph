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
  description = "EC2 instance type. t3.large gives 2 vCPU / 8 GB — the extra RAM keeps the bge-small embedder and Chroma off swap. Careful-mode (transformer) ingest is CPU-bound, so bump to t3.xlarge (4 vCPU) or a GPU box if you need it fast; Fast mode is light enough for any of these."
  type        = string
  default     = "t3.large"
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
