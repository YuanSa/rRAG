# Beam Search For Traversal Budgets

When an agent traverses a category tree, it should not expand every relevant branch equally.

A practical strategy is:

- keep a small branch budget per level
- prefer the strongest branches first
- stop exploring once the traversal budget is exhausted

This keeps retrieval focused and prevents BFS-style branch explosion.
