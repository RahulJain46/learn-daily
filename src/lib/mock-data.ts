export type Category = "dsa" | "system_design" | "concept";

export interface LearningEntry {
  id: string;
  title: string;
  category: Category;
  tags: string[];
  difficulty: "easy" | "medium" | "hard";
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface RevisionCard {
  id: string;
  entryId: string;
  questionType: "mcq" | "short_answer";
  question: string;
  options?: { text: string; isCorrect: boolean }[];
  answer: string;
  due: string;
}

export interface Flashcard {
  id: string;
  entryId: string;
  front: string;
  back: string;
  category: Category;
  tags: string[];
}

export const mockEntries: LearningEntry[] = [
  {
    id: "1",
    title: "Binary Search - Finding Target in Sorted Array",
    category: "dsa",
    tags: ["binary-search", "arrays", "searching"],
    difficulty: "easy",
    content: `Binary search works on sorted arrays by repeatedly dividing the search interval in half.\n\n**Algorithm:**\n1. Compare target with middle element\n2. If target matches middle, return index\n3. If target < middle, search left half\n4. If target > middle, search right half\n\n**Time Complexity:** O(log n)\n**Space Complexity:** O(1) iterative, O(log n) recursive\n\n\`\`\`python\ndef binary_search(arr, target):\n    left, right = 0, len(arr) - 1\n    while left <= right:\n        mid = (left + right) // 2\n        if arr[mid] == target:\n            return mid\n        elif arr[mid] < target:\n            left = mid + 1\n        else:\n            right = mid - 1\n    return -1\n\`\`\`\n\n**Edge Cases:** Empty array, single element, target not present, duplicates.`,
    createdAt: "2026-05-01",
    updatedAt: "2026-05-01",
  },
  {
    id: "2",
    title: "CAP Theorem - Distributed Systems Trade-offs",
    category: "system_design",
    tags: ["distributed-systems", "cap-theorem", "consistency"],
    difficulty: "medium",
    content: `The CAP theorem states that a distributed system can only provide two of three guarantees simultaneously:\n\n- **Consistency (C):** Every read receives the most recent write\n- **Availability (A):** Every request receives a response (not guaranteed to be most recent)\n- **Partition Tolerance (P):** System continues to operate despite network partitions\n\n**In practice**, since network partitions are unavoidable, the real choice is between CP and AP:\n- **CP systems:** MongoDB, HBase, Redis (single master)\n- **AP systems:** Cassandra, DynamoDB, CouchDB\n\n**Key insight:** CAP is about behavior during a partition. When there's no partition, you can have all three.`,
    createdAt: "2026-05-02",
    updatedAt: "2026-05-02",
  },
  {
    id: "3",
    title: "JavaScript Event Loop - How Async Works",
    category: "concept",
    tags: ["javascript", "event-loop", "async", "concurrency"],
    difficulty: "medium",
    content: `The event loop is JavaScript's mechanism for handling async operations in a single-threaded environment.\n\n**Components:**\n1. **Call Stack** - Executes synchronous code (LIFO)\n2. **Web APIs** - Handle async operations (setTimeout, fetch, DOM events)\n3. **Callback Queue (Task Queue)** - Holds callbacks ready to execute\n4. **Microtask Queue** - Promises, MutationObserver (higher priority)\n\n**Execution Order:**\n1. Execute all synchronous code in call stack\n2. Process ALL microtasks (Promise.then, queueMicrotask)\n3. Process ONE macrotask (setTimeout, setInterval)\n4. Repeat\n\n**Key Rule:** Microtasks always run before the next macrotask.`,
    createdAt: "2026-05-03",
    updatedAt: "2026-05-03",
  },
  {
    id: "4",
    title: "LRU Cache - Design and Implementation",
    category: "dsa",
    tags: ["cache", "linked-list", "hashmap", "design"],
    difficulty: "medium",
    content: `LRU (Least Recently Used) Cache evicts the least recently used item when capacity is full.\n\n**Data Structure:** Doubly Linked List + HashMap\n- HashMap: key → node (O(1) lookup)\n- Doubly Linked List: maintains access order (O(1) add/remove)\n\n**Operations:**\n- get(key): O(1) - move node to head\n- put(key, value): O(1) - add to head, evict tail if full\n\n**Why doubly linked list?** Need O(1) removal of any node (need prev pointer).`,
    createdAt: "2026-05-04",
    updatedAt: "2026-05-04",
  },
  {
    id: "5",
    title: "Load Balancing Strategies",
    category: "system_design",
    tags: ["load-balancer", "scaling", "distribution"],
    difficulty: "hard",
    content: `Load balancers distribute incoming traffic across multiple servers.\n\n**Algorithms:**\n- **Round Robin** - Simple rotation, doesn't consider server load\n- **Weighted Round Robin** - Accounts for server capacity\n- **Least Connections** - Routes to server with fewest active connections\n- **IP Hash** - Consistent routing based on client IP (sticky sessions)\n- **Consistent Hashing** - Minimal redistribution when servers added/removed\n\n**Layers:**\n- L4 (Transport) - TCP/UDP level, faster, less flexible\n- L7 (Application) - HTTP level, can route by URL/headers/cookies\n\n**Health Checks:** Active (periodic pings) vs Passive (monitor responses)`,
    createdAt: "2026-05-05",
    updatedAt: "2026-05-05",
  },
];

export const mockCards: RevisionCard[] = [
  {
    id: "c1",
    entryId: "1",
    questionType: "mcq",
    question: "What is the time complexity of binary search?",
    options: [
      { text: "O(n)", isCorrect: false },
      { text: "O(log n)", isCorrect: true },
      { text: "O(n log n)", isCorrect: false },
      { text: "O(1)", isCorrect: false },
    ],
    answer: "O(log n)",
    due: "2026-05-05",
  },
  {
    id: "c2",
    entryId: "1",
    questionType: "short_answer",
    question: "Why does binary search require a sorted array?",
    answer:
      "Binary search eliminates half the search space at each step by comparing with the middle element. This only works if elements are ordered, so we know which half contains the target.",
    due: "2026-05-05",
  },
  {
    id: "c3",
    entryId: "2",
    questionType: "mcq",
    question: "Which of the following is an AP system?",
    options: [
      { text: "MongoDB", isCorrect: false },
      { text: "HBase", isCorrect: false },
      { text: "Cassandra", isCorrect: true },
      { text: "Redis (single master)", isCorrect: false },
    ],
    answer: "Cassandra",
    due: "2026-05-05",
  },
  {
    id: "c4",
    entryId: "3",
    questionType: "mcq",
    question: "In the JavaScript event loop, which has higher priority?",
    options: [
      { text: "Macrotask queue", isCorrect: false },
      { text: "Microtask queue", isCorrect: true },
      { text: "Both have equal priority", isCorrect: false },
      { text: "It depends on the browser", isCorrect: false },
    ],
    answer: "Microtask queue",
    due: "2026-05-06",
  },
  {
    id: "c5",
    entryId: "4",
    questionType: "short_answer",
    question: "Why is a doubly linked list used in LRU Cache instead of a singly linked list?",
    answer:
      "A doubly linked list allows O(1) removal of any node because we have access to the previous pointer. With a singly linked list, removing a node requires traversing from the head to find the previous node, which is O(n).",
    due: "2026-05-06",
  },
  {
    id: "c6",
    entryId: "5",
    questionType: "mcq",
    question: "Which load balancing algorithm provides sticky sessions?",
    options: [
      { text: "Round Robin", isCorrect: false },
      { text: "Least Connections", isCorrect: false },
      { text: "IP Hash", isCorrect: true },
      { text: "Random", isCorrect: false },
    ],
    answer: "IP Hash",
    due: "2026-05-07",
  },
];

export const mockFlashcards: Flashcard[] = [
  {
    id: "f1",
    entryId: "1",
    front: "Binary Search",
    back: "Works on sorted arrays by repeatedly dividing the search interval in half.\n\n• Compare target with middle element\n• If target < middle → search left half\n• If target > middle → search right half\n\nTime: O(log n) | Space: O(1)\n\nKey requirement: Array MUST be sorted.",
    category: "dsa",
    tags: ["binary-search", "arrays"],
  },
  {
    id: "f2",
    entryId: "2",
    front: "CAP Theorem",
    back: "A distributed system can only guarantee 2 of 3:\n\n• Consistency — every read gets the latest write\n• Availability — every request gets a response\n• Partition Tolerance — system works despite network failures\n\nSince partitions are inevitable, real choice is CP vs AP.\n\nCP: MongoDB, HBase | AP: Cassandra, DynamoDB",
    category: "system_design",
    tags: ["distributed-systems", "cap-theorem"],
  },
  {
    id: "f3",
    entryId: "3",
    front: "JavaScript Event Loop",
    back: "Handles async in single-threaded JS:\n\n1. Call Stack — executes sync code (LIFO)\n2. Web APIs — handle async (setTimeout, fetch)\n3. Microtask Queue — Promises (HIGH priority)\n4. Macrotask Queue — setTimeout (LOW priority)\n\nOrder: Sync → ALL Microtasks → ONE Macrotask → Repeat\n\nKey: Microtasks ALWAYS run before next macrotask.",
    category: "concept",
    tags: ["javascript", "event-loop"],
  },
  {
    id: "f4",
    entryId: "4",
    front: "LRU Cache",
    back: "Evicts least recently used item when capacity is full.\n\nData Structure: HashMap + Doubly Linked List\n• HashMap: key → node (O(1) lookup)\n• DLL: maintains access order (O(1) add/remove)\n\nOperations:\n• get(key): O(1) — move to head\n• put(key, val): O(1) — add to head, evict tail if full\n\nWhy DLL? Need O(1) removal (requires prev pointer).",
    category: "dsa",
    tags: ["cache", "linked-list", "hashmap"],
  },
  {
    id: "f5",
    entryId: "5",
    front: "Load Balancing Algorithms",
    back: "Distribute traffic across servers:\n\n• Round Robin — simple rotation\n• Weighted RR — accounts for server capacity\n• Least Connections — fewest active connections\n• IP Hash — sticky sessions (consistent client routing)\n• Consistent Hashing — minimal redistribution on change\n\nLayers:\n• L4 (Transport) — fast, TCP/UDP level\n• L7 (Application) — flexible, HTTP routing",
    category: "system_design",
    tags: ["load-balancer", "scaling"],
  },
];

export const mockStats = {
  streak: 12,
  cardsDueToday: 4,
  totalCards: 6,
  totalFlashcards: 5,
  totalEntries: 5,
  accuracy: 87,
  reviewedThisWeek: 23,
  correctThisWeek: 20,
};
