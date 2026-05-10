-- ============================================
-- Seed: DSA Interview Entries + Cards
-- Run this in Supabase SQL Editor
-- ============================================

-- User ID (mock user)
-- Using the default mock user: 00000000-0000-0000-0000-000000000000

-- Add subcategory column if it doesn't exist
ALTER TABLE entries ADD COLUMN IF NOT EXISTS subcategory TEXT;

-- ============================================
-- ENTRIES
-- ============================================

INSERT INTO entries (id, user_id, title, content, category, subcategory, tags, difficulty) VALUES

-- 1. Arrays & Two Pointers
('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
'Two Sum Problem',
'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.

Approach 1: Brute Force - O(n²) time, O(1) space. Check every pair.

Approach 2: Hash Map - O(n) time, O(n) space. For each element, check if (target - element) exists in the map. If yes, return both indices. Otherwise, store current element and its index.

Key insight: Trading space for time using a hash map to achieve single-pass solution.

Edge cases: Same element used twice, negative numbers, no solution exists.',
'dsa', 'Arrays & Strings', ARRAY['arrays', 'hash-map', 'two-pointers'], 'easy'),

-- 2. Linked Lists
('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
'Reverse a Linked List',
'Reverse a singly linked list iteratively and recursively.

Iterative Approach:
- Use three pointers: prev (null), curr (head), next
- At each step: save next, point curr.next to prev, advance prev and curr
- Time: O(n), Space: O(1)

Recursive Approach:
- Base case: head is null or head.next is null → return head
- Recursively reverse the rest of the list
- Set head.next.next = head, head.next = null
- Time: O(n), Space: O(n) due to call stack

This is a fundamental pattern. Many linked list problems (reverse in groups, palindrome check) build on this.',
'dsa', 'Linked Lists', ARRAY['linked-list', 'recursion', 'iterative'], 'easy'),

-- 3. Binary Search
('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
'Binary Search Variations',
'Standard binary search finds an element in O(log n) time in a sorted array.

Variations:
1. Find first occurrence: when arr[mid] == target, move right = mid (don''t return immediately)
2. Find last occurrence: when arr[mid] == target, move left = mid (don''t return immediately)
3. Search in rotated sorted array: determine which half is sorted, then decide direction
4. Find peak element: compare mid with mid+1, move toward the larger side
5. Search insert position: if not found, left pointer gives insertion index

Template:
left, right = 0, n-1
while left <= right:
    mid = left + (right - left) // 2  (avoids overflow)
    if condition: left = mid + 1
    else: right = mid - 1

Key insight: Binary search works anytime you can identify a monotonic predicate (true/false boundary).',
'dsa', 'Sorting & Searching', ARRAY['binary-search', 'divide-conquer', 'sorted-array'], 'medium'),

-- 4. Stack Problems
('a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
'Valid Parentheses & Monotonic Stack',
'Valid Parentheses:
- Push opening brackets onto stack
- For closing brackets, check if stack top matches
- At end, stack should be empty
- Time: O(n), Space: O(n)

Monotonic Stack Pattern:
Used for "next greater element", "largest rectangle in histogram", "stock span" problems.

Approach: Maintain a stack that is always in increasing (or decreasing) order.
- For next greater element: iterate from right, pop elements smaller than current, top of stack is the answer
- For largest rectangle: for each bar, find how far left and right it can extend

Key insight: Monotonic stack processes elements in O(n) total despite nested loops, because each element is pushed and popped at most once.',
'dsa', 'Stacks & Queues', ARRAY['stack', 'monotonic-stack', 'parentheses'], 'medium'),

-- 5. Trees - BFS/DFS
('a0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000',
'Binary Tree Traversals & Common Patterns',
'Traversal Types:
- Inorder (Left, Root, Right): gives sorted order for BST
- Preorder (Root, Left, Right): useful for serialization
- Postorder (Left, Right, Root): useful for deletion, calculating heights
- Level Order (BFS): use a queue, process level by level

Common Interview Patterns:
1. Max Depth: return 1 + max(depth(left), depth(right))
2. Same Tree: both null → true, one null → false, compare values + recurse both sides
3. Invert Tree: swap left and right children, recurse
4. Lowest Common Ancestor: if root is p or q, return root; recurse left and right; if both non-null, root is LCA
5. Validate BST: pass min/max bounds, each node must satisfy lower < node.val < upper

Time complexity for most tree problems: O(n) where n is number of nodes.
Space complexity: O(h) where h is height (O(log n) balanced, O(n) worst case).',
'dsa', 'Trees & Graphs', ARRAY['binary-tree', 'bfs', 'dfs', 'recursion'], 'medium'),

-- 6. Dynamic Programming
('a0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000',
'Dynamic Programming Fundamentals',
'DP = Recursion + Memoization (top-down) OR Tabulation (bottom-up)

When to use DP:
1. Optimal substructure: optimal solution contains optimal solutions to subproblems
2. Overlapping subproblems: same subproblems solved multiple times

Steps to solve:
1. Define state: what parameters uniquely identify a subproblem?
2. Write recurrence relation
3. Identify base cases
4. Decide iteration order (for bottom-up)
5. Optimize space if possible

Classic Problems:
- Fibonacci: dp[i] = dp[i-1] + dp[i-2]
- Climbing Stairs: same as fibonacci
- Coin Change: dp[amount] = min(dp[amount - coin] + 1) for each coin
- Longest Common Subsequence: 2D DP, dp[i][j] = dp[i-1][j-1]+1 if match, else max(dp[i-1][j], dp[i][j-1])
- 0/1 Knapsack: dp[i][w] = max(dp[i-1][w], dp[i-1][w-weight[i]] + value[i])
- Longest Increasing Subsequence: O(n²) basic, O(n log n) with binary search

Space optimization: if dp[i] only depends on dp[i-1], use two rows or single row.',
'dsa', 'Dynamic Programming', ARRAY['dp', 'memoization', 'tabulation', 'optimization'], 'hard'),

-- 7. Graphs
('a0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000000',
'Graph Algorithms for Interviews',
'Representations: Adjacency List (sparse), Adjacency Matrix (dense)

BFS (Breadth-First Search):
- Use queue, process level by level
- Finds shortest path in unweighted graphs
- Time: O(V + E)

DFS (Depth-First Search):
- Use stack or recursion
- Good for: cycle detection, topological sort, connected components
- Time: O(V + E)

Key Algorithms:
1. Topological Sort: DFS + stack (post-order) or Kahn''s (BFS with in-degree)
2. Dijkstra: shortest path with non-negative weights, use min-heap
3. Union-Find: detect cycles, connected components. Path compression + union by rank → nearly O(1)
4. Number of Islands: DFS/BFS from each ''1'', mark visited

Cycle Detection:
- Undirected: if visited neighbor is not parent → cycle
- Directed: if neighbor is in current DFS path (gray node) → cycle',
'dsa', 'Trees & Graphs', ARRAY['graph', 'bfs', 'dfs', 'dijkstra', 'topological-sort'], 'hard'),

-- 8. Sliding Window
('a0000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000000',
'Sliding Window Technique',
'Pattern for subarray/substring problems where you need to find optimal contiguous segment.

Fixed-size window:
- Use for "max sum of subarray of size k"
- Add new element, remove leftmost, track max

Variable-size window:
Template:
  left = 0
  for right in range(n):
      // expand: add arr[right] to window state
      while window_invalid:
          // shrink: remove arr[left] from window state
          left++
      // update answer

Classic Problems:
1. Longest Substring Without Repeating Characters: use set/map, shrink when duplicate found
2. Minimum Window Substring: use frequency map, shrink when all chars are covered
3. Max Consecutive Ones III: shrink when zeros in window exceed k
4. Longest Repeating Character Replacement: shrink when (window_size - max_freq) > k

Time: O(n) — each element is added and removed from window at most once.',
'dsa', 'Arrays & Strings', ARRAY['sliding-window', 'two-pointers', 'substring'], 'medium'),

-- 9. Heap / Priority Queue
('a0000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000000',
'Heaps and Priority Queue Problems',
'Heap: complete binary tree where parent ≤ children (min-heap) or parent ≥ children (max-heap).

Operations: insert O(log n), extract-min/max O(log n), peek O(1)

When to use:
- Need kth largest/smallest → min-heap of size k
- Need to repeatedly get min/max → priority queue
- Merge k sorted lists → min-heap of k elements

Classic Problems:
1. Kth Largest Element: maintain min-heap of size k, top is answer
2. Top K Frequent Elements: count frequencies, use min-heap of size k by frequency
3. Merge K Sorted Lists: push first element of each list, pop min, push its next
4. Find Median in Stream: max-heap for lower half, min-heap for upper half, balance sizes

In most languages:
- Python: heapq (min-heap by default, negate for max-heap)
- Java: PriorityQueue (min-heap, use Comparator.reverseOrder() for max)
- JavaScript: no built-in, implement or use library',
'dsa', 'Heaps & Priority Queues', ARRAY['heap', 'priority-queue', 'top-k'], 'medium'),

-- 10. Backtracking
('a0000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000000',
'Backtracking Pattern',
'Backtracking = DFS + pruning. Explore all candidates, abandon ("backtrack") as soon as constraint is violated.

Template:
function backtrack(state, choices):
    if is_goal(state):
        result.add(copy of state)
        return
    for choice in choices:
        if is_valid(choice):
            make_choice(state, choice)
            backtrack(state, remaining_choices)
            undo_choice(state, choice)  // backtrack

Classic Problems:
1. Subsets: for each element, choose to include or exclude
2. Permutations: try each unused element at current position
3. Combination Sum: try each candidate, allow repeats (don''t advance start) or not
4. N-Queens: place queen row by row, check column/diagonal conflicts
5. Word Search: DFS from each cell, mark visited, backtrack

Key optimizations:
- Sort input to skip duplicates (subsets II, combinations II)
- Early termination when remaining sum is impossible
- Use visited array or modify in-place (restore after backtrack)

Time complexity: often O(2^n) or O(n!) — exponential, but pruning helps in practice.',
'dsa', 'Recursion & Backtracking', ARRAY['backtracking', 'recursion', 'dfs', 'pruning'], 'hard');


-- ============================================
-- CARDS (Revision Questions)
-- ============================================

-- Cards for Two Sum
INSERT INTO cards (user_id, entry_id, question_type, question, options, answer) VALUES
('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'mcq',
'What is the optimal time complexity for the Two Sum problem?',
'[{"text": "O(n²)", "isCorrect": false}, {"text": "O(n log n)", "isCorrect": false}, {"text": "O(n)", "isCorrect": true}, {"text": "O(1)", "isCorrect": false}]',
'Using a hash map, we can solve Two Sum in O(n) time with a single pass through the array.'),

('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'short_answer',
'Explain the hash map approach for Two Sum.',
NULL,
'For each element, check if (target - current element) exists in the hash map. If yes, return both indices. If not, store the current element with its index in the map. This gives O(n) time and O(n) space.'),

('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'flashcard',
'What is the space-time tradeoff in Two Sum?',
NULL,
'Brute force uses O(1) space but O(n²) time. Hash map approach trades O(n) space for O(n) time — a common optimization pattern.'),

-- Cards for Reverse Linked List
('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000002', 'mcq',
'What is the space complexity of iterative linked list reversal?',
'[{"text": "O(n)", "isCorrect": false}, {"text": "O(1)", "isCorrect": true}, {"text": "O(log n)", "isCorrect": false}, {"text": "O(n²)", "isCorrect": false}]',
'Iterative reversal uses only three pointers (prev, curr, next), so space is O(1) regardless of list size.'),

('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000002', 'short_answer',
'What are the three pointers used in iterative linked list reversal and what does each step do?',
NULL,
'prev (initially null), curr (initially head), next (temp storage). Each step: save next = curr.next, reverse link curr.next = prev, advance prev = curr, advance curr = next. Loop until curr is null, then prev is the new head.'),

('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000002', 'flashcard',
'Why is recursive linked list reversal O(n) space?',
NULL,
'Each recursive call adds a frame to the call stack. For a list of n nodes, there are n recursive calls before hitting the base case, so the call stack uses O(n) space.'),

-- Cards for Binary Search
('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000003', 'mcq',
'Why do we use mid = left + (right - left) / 2 instead of (left + right) / 2?',
'[{"text": "It is faster to compute", "isCorrect": false}, {"text": "It avoids integer overflow", "isCorrect": true}, {"text": "It gives a more accurate midpoint", "isCorrect": false}, {"text": "It works with floating point numbers", "isCorrect": false}]',
'When left and right are large integers, their sum can overflow. Using left + (right - left) / 2 avoids this by never computing the full sum.'),

('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000003', 'short_answer',
'How do you find the first occurrence of a target in a sorted array with duplicates?',
NULL,
'Use binary search, but when arr[mid] == target, don''t return immediately. Instead, set right = mid - 1 to continue searching in the left half. Track the last found index. After the loop, return the tracked index.'),

('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000003', 'mcq',
'In a rotated sorted array [4,5,6,7,0,1,2], how do you decide which half to search?',
'[{"text": "Always search the left half first", "isCorrect": false}, {"text": "Compare target with the middle element only", "isCorrect": false}, {"text": "Determine which half is sorted, then check if target falls in that range", "isCorrect": true}, {"text": "Use linear search since binary search doesn''t work", "isCorrect": false}]',
'Compare arr[left] with arr[mid] to find the sorted half. If target is within the sorted half''s range, search there; otherwise search the other half.'),

-- Cards for Stack Problems
('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000004', 'mcq',
'What is the time complexity of the monotonic stack approach for "Next Greater Element"?',
'[{"text": "O(n²)", "isCorrect": false}, {"text": "O(n log n)", "isCorrect": false}, {"text": "O(n)", "isCorrect": true}, {"text": "O(n³)", "isCorrect": false}]',
'Each element is pushed and popped from the stack at most once, giving O(n) total operations despite the while loop inside the for loop.'),

('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000004', 'short_answer',
'How do you validate if a string of parentheses is balanced?',
NULL,
'Use a stack. Push opening brackets. For each closing bracket, check if the stack top has the matching opening bracket — if yes pop it, if no or stack is empty, return false. At the end, return true only if the stack is empty.'),

-- Cards for Binary Tree
('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000005', 'mcq',
'Which traversal of a BST gives elements in sorted order?',
'[{"text": "Preorder", "isCorrect": false}, {"text": "Inorder", "isCorrect": true}, {"text": "Postorder", "isCorrect": false}, {"text": "Level order", "isCorrect": false}]',
'Inorder traversal (Left, Root, Right) visits BST nodes in ascending order because all left subtree values < root < all right subtree values.'),

('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000005', 'short_answer',
'How do you find the Lowest Common Ancestor (LCA) of two nodes in a binary tree?',
NULL,
'Recursively: if root is null or equals p or q, return root. Recurse left and right. If both return non-null, root is the LCA. If only one side returns non-null, that''s the LCA. Time: O(n).'),

('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000005', 'flashcard',
'What is the space complexity of tree DFS vs BFS?',
NULL,
'DFS: O(h) where h is height — O(log n) for balanced, O(n) for skewed. BFS: O(w) where w is max width — up to O(n/2) = O(n) for the last level of a complete tree.'),

-- Cards for Dynamic Programming
('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000006', 'mcq',
'What are the two properties required for a problem to be solvable with DP?',
'[{"text": "Greedy choice property and optimal substructure", "isCorrect": false}, {"text": "Optimal substructure and overlapping subproblems", "isCorrect": true}, {"text": "Divide and conquer with memoization", "isCorrect": false}, {"text": "Recursion and iteration", "isCorrect": false}]',
'DP requires: (1) Optimal substructure — optimal solution uses optimal sub-solutions, and (2) Overlapping subproblems — same subproblems are solved repeatedly.'),

('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000006', 'short_answer',
'Explain the recurrence relation for the Coin Change problem.',
NULL,
'dp[amount] = min(dp[amount - coin] + 1) for each coin denomination. Base case: dp[0] = 0. If dp[amount] is not reachable, return -1. This builds up from smaller amounts to the target.'),

('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000006', 'flashcard',
'What is the difference between top-down and bottom-up DP?',
NULL,
'Top-down: recursive with memoization, starts from the main problem and caches sub-results. Bottom-up: iterative tabulation, fills a table from base cases upward. Both have same time complexity; bottom-up avoids recursion overhead.'),

-- Cards for Graphs
('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000007', 'mcq',
'What data structure does Dijkstra''s algorithm use for efficiency?',
'[{"text": "Stack", "isCorrect": false}, {"text": "Queue", "isCorrect": false}, {"text": "Min-heap (priority queue)", "isCorrect": true}, {"text": "Hash set", "isCorrect": false}]',
'Dijkstra uses a min-heap to always process the vertex with the smallest known distance, giving O((V + E) log V) time complexity.'),

('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000007', 'short_answer',
'How do you detect a cycle in a directed graph?',
NULL,
'Use DFS with three states: white (unvisited), gray (in current path), black (fully processed). If DFS encounters a gray node, there''s a cycle. Alternatively, if topological sort can''t include all nodes, a cycle exists.'),

('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000007', 'flashcard',
'What is the time complexity of BFS/DFS on a graph?',
NULL,
'O(V + E) where V is vertices and E is edges. We visit each vertex once and examine each edge once (or twice for undirected graphs).'),

-- Cards for Sliding Window
('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000008', 'mcq',
'In the sliding window technique, why is the overall time complexity O(n) despite nested loops?',
'[{"text": "The inner loop runs at most n times total across all iterations", "isCorrect": true}, {"text": "The inner loop runs in O(1) each time", "isCorrect": false}, {"text": "We use binary search inside", "isCorrect": false}, {"text": "The window size is fixed", "isCorrect": false}]',
'The left pointer only moves forward and can advance at most n times total. So even though there''s a while loop inside the for loop, total work across all iterations is O(n).'),

('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000008', 'short_answer',
'How do you solve "Longest Substring Without Repeating Characters"?',
NULL,
'Use a sliding window with a hash set. Expand right pointer, adding characters. When a duplicate is found, shrink from left until the duplicate is removed. Track max window size throughout. Time: O(n).'),

-- Cards for Heaps
('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000009', 'mcq',
'To find the Kth largest element in an array, which heap should you use?',
'[{"text": "Max-heap of size n", "isCorrect": false}, {"text": "Min-heap of size k", "isCorrect": true}, {"text": "Max-heap of size k", "isCorrect": false}, {"text": "Min-heap of size n", "isCorrect": false}]',
'Maintain a min-heap of size k. The top of the heap is always the kth largest. If a new element is larger than the top, pop and push. Time: O(n log k).'),

('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000009', 'short_answer',
'How do you find the median from a stream of numbers?',
NULL,
'Use two heaps: a max-heap for the lower half and a min-heap for the upper half. Balance them so sizes differ by at most 1. Median is either the top of the larger heap, or average of both tops if equal size. Insert: O(log n), Find median: O(1).'),

-- Cards for Backtracking
('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000010', 'mcq',
'What distinguishes backtracking from plain recursion?',
'[{"text": "Backtracking uses iteration instead of recursion", "isCorrect": false}, {"text": "Backtracking undoes choices and prunes invalid paths early", "isCorrect": true}, {"text": "Backtracking always has polynomial time complexity", "isCorrect": false}, {"text": "Backtracking doesn''t use a base case", "isCorrect": false}]',
'Backtracking extends recursion by undoing choices (backtracking step) and pruning branches that violate constraints, avoiding exploration of entire invalid subtrees.'),

('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000010', 'short_answer',
'How do you avoid duplicate subsets when the input array has duplicate elements?',
NULL,
'Sort the array first. During backtracking, if the current element equals the previous one at the same recursion level (i.e., same position in choices), skip it. This ensures each unique combination is generated only once.'),

('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000010', 'flashcard',
'What is the time complexity of generating all subsets of an array of n elements?',
NULL,
'O(2^n) — each element has two choices (include or exclude), giving 2^n subsets. Generating each subset takes O(n) for copying, so total is O(n × 2^n).');
