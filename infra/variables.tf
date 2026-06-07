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
  description = "EC2 instance type. t3.xlarge gives 4 vCPU / 16 GB — the 4 vCPU speed up Careful-mode (transformer) ingest, which is CPU-bound, and 16 GB keeps the embedder and Chroma well off swap. For genuinely fast Careful ingest on large repos use a GPU box; Fast mode (static embeddings) is light on anything."
  type        = string
  default     = "t3.xlarge"
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
