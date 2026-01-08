nodes:
  id (UUID)
  content_hash
  timestamp_created
  timestamp_modified  
  source_path
  type
  size
  metadata (JSON blob for extensibility)

links:
  id
  source_node
  target_node
  *directionality?
  timestamp_created
  timestamp_modified  
  type
  strength
  metadata (JSON)

tags:
  id
  tag_name
  timestamp_created
  node_id