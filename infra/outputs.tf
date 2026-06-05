output "public_ip" {
  description = "Elastic IP of the Glyph host."
  value       = aws_eip.glyph.public_ip
}

output "app_url" {
  description = "Public URL for the running app."
  value       = "http://${aws_eip.glyph.public_ip}"
}

output "ssh_command" {
  description = "SSH into the box."
  value       = "ssh -i ${path.module}/${var.project}-deploy.pem ubuntu@${aws_eip.glyph.public_ip}"
}

output "instance_id" {
  description = "EC2 instance id."
  value       = aws_instance.glyph.id
}
