
## Graph_loader.py
```python
try:

# Create vector indices

	await graph.query(
	
		"""
		
		CREATE VECTOR INDEX FOR (t:Table) ON (t.embedding)
		
		OPTIONS {dimension:$size, similarityFunction:'euclidean'}
		
		""",
		
		{"size": vec_len},
	
	)

  

	await graph.query(
		
		"""
		
		CREATE VECTOR INDEX FOR (c:Column) ON (c.embedding)
		
		OPTIONS {dimension:$size, similarityFunction:'euclidean'}
		
		""",
		
		{"size": vec_len},
	
	)

	await graph.query("CREATE INDEX FOR (p:Table) ON (p.name)")
	
	except Exception as e: # pylint: disable=broad-exception-caught
	
	logger.warning("Error creating vector indices: %s", e)
```

Cụ thể 3 query:

- `CREATE VECTOR INDEX FOR (t:Table) ON (t.embedding) ...`
    
    - Tạo vector index cho node `Table` trên thuộc tính `embedding`.
    - Dùng để similarity search theo vector ở cấp bảng (tìm bảng liên quan câu hỏi).
- `CREATE VECTOR INDEX FOR (c:Column) ON (c.embedding) ...`
    
    - Tạo vector index cho node `Column` trên `embedding`.
    - Dùng để semantic search ở cấp cột (tìm cột liên quan intent người dùng).
- `CREATE INDEX FOR (p:Table) ON (p.name)`
    
    - Tạo index thường (B-tree-like) cho `Table.name`.
    - Tăng tốc lookup exact theo tên bảng (match/filter/join theo name).

### Ý nghĩa tham số trong vector index

- `dimension:$size`: chiều vector phải khớp embedding model (`vec_len`).
- `similarityFunction:'euclidean'`: dùng khoảng cách Euclidean để đo độ gần vector.

