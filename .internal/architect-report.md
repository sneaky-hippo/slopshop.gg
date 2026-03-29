# 5-Team Architecture Report

Problem: Local LLMs (4-8GB) need to "know" a 500K token codebase.
Goal: 90%+ quality on codebase-specific questions.

## COMPRESSION (llama3)
To compress the 500K tokens of codebase into a 2K token "cheat sheet" that a small model can use, I propose the following architecture:

**Codebase Representation**

1. **Tokenization**: Break down the entire codebase into individual tokens (e.g., words, symbols). This will result in approximately 500K tokens.
2. **Frequency Analysis**: Analyze the frequency of each token to identify the most common patterns, functions, and APIs. This will help reduce the dimensionality of the data.

**Cheat Sheet Generation**

1. **Key-Value Pairs**: Represent the codebase's essential information as key-value pairs. For example:
	* File names + line counts: `{"server-v2.js": 8000, "cli.js": 4000}`
	* Function signatures: `{"getUsers": (req, res) => { ... }, "saveUser": (user, callback) => { ... }}`
	* Known bugs: `{"bug1": ["Line 123 in server-v2.js", "Line 456 in cli.js"]}`
	* Key patterns: `{"switch_statement": [(line_num, pattern), ...], "loop_pattern": [(line_num, pattern), ...]}`
	* API endpoints: `{"endpoints": {"getUsers": "/users", "saveUser": "/user/:id"}}`
2. **Tokenization**: Break down the key-value pairs into individual tokens, resulting in approximately 2K tokens.

**Compression**

1. **Run-Length Encoding (RLE)**: Apply RLE to compress the tokenized cheat sheet. This will reduce the dimensionality of the data.
2. **Huffman Coding**: Use Huffman coding to further compress the RLE-encoded data.

**Update Mechanism**

1. **Delta Encoding**: When code changes, calculate the differences (deltas) between the old and new codebase representations.
2. **Patch Generation**: Generate a patch that applies the deltas to the existing cheat sheet. This will result in an updated 2K token "cheat sheet" that reflects the changes.

**Technical Design**

Here's a technical design for building and updating the cheat sheet:

1. **Language**: Implement the system using Python or JavaScript, depending on your team's expertise.
2. **Libraries**:
	* For tokenization: Use NLTK (Python) or Tokenizer.js (JavaScript).
	* For frequency analysis: Utilize a library like scikit-learn (Python) or Statsmodels (Python).
	* For compression: Employ libraries like PyRLE (Python) and HuffmanCoding (JavaScript).
3. **Data Storage**: Store the cheat sheet in a JSON file or a database like MongoDB.
4. **Update Process**:
	1. Run the delta encoding algorithm on the updated codebase representation.
	2. Apply the patch to the existing cheat sheet.
	3. Update the cheat sheet with the new information.

By compressing the 500K tokens of codebase into a 2K token "cheat sheet", we can effectively reduce the dimensionality of the data and make it manageable for small models to learn from. The update mechanism ensures that the cheat sheet remains relevant even when code changes.

**Example Cheat Sheet**

Here's an example of what the compressed cheat sheet might look like:
```json
{
  "files": {
    "server-v2.js": 8000,
    "cli.js": 4000,
    "mcp-server.js": 400,
    "agent.js": 500
  },
  "functions": {
    "getUsers": (req, res) => { ... },
    "saveUser": (user, callback) => { ... }
  },
  "bugs": {
    "bug1": ["Line 123 in server-v2.js", "Line 456 in cli.js"]
  },
  "patterns": {
    "switch_statement": [(line_num, pattern), ...],
    "loop_pattern": [(line_num, pattern), ...]
  },
  "endpoints": {
    "getUsers": "/users",
    "saveUser": "/user/:id"
  }
}
```
This cheat sheet contains essential information about the codebase, including file names and line counts, function signatures, known bugs, and API endpoints.

---

## ROUTING (mistral)
 To achieve your goal of improving the quality of local models' responses and allowing them to provide precise suggestions for your Node.js codebase, I will outline an approach using an Inverted Index and Fuzzy Search algorithm for efficient indexing and query matching.

1. **Inverted Index**: An Inverted Index is a data structure that maps words in a document collection to the documents that contain those words. This allows us to quickly look up which files or code sections contain a specific term, making it an ideal choice for our use case.

   - Tokenize and index each file in the codebase, extracting approximately 500 tokens per file (or less if needed for precision).
   - Store the extracted tokens along with their corresponding line numbers and file names in the Inverted Index.
   - Use a data structure like a Trie or hash map to store the Inverted Index efficiently.

2. **Fuzzy Search Algorithm**: Given that users may ask questions using imprecise terminology, we'll implement a Fuzzy Search algorithm to match queries with the relevant code sections in an approximate manner, taking into account common misspellings and typos.

   - Use a Levenshtein Distance or similar algorithm to compute the edit distance between the user's query and the tokens in the Inverted Index.
   - Sort the results by their edit distance, and return the top n (e.g., 5) most relevant code sections.

3. **Query Routing**: When a user asks a question like "how can we improve search?", break down the question into individual terms such as ["improve", "search"] and perform fuzzy searches for each term separately in the Inverted Index.
   - Combine the top n results for each term, ensuring they come from the same files if possible.
   - Return the context around these combined results (500 tokens), providing a relevant code snippet to answer the user's question.

4. **Efficiency and Performance**: To optimize performance, we can implement caching for frequently asked questions or common terms in the codebase. This will help reduce the time spent on computations and speed up response times. Additionally, consider using a search index library like Elasticsearch to handle large-scale queries and improve query processing efficiency.

5. **Evaluation and Iteration**: Measure the quality of the system's responses by testing it with a variety of questions related to different parts of the codebase. Continuously iterate on the approach, adjusting parameters like the number of tokens per file or fuzzy search algorithm, to improve the accuracy and relevance of the returned results.

---

## STORAGE (deepseek-coder-v2)
 To achieve the goal of having local LLMs provide high-quality, codebase-specific suggestions, we need to build a robust local database that can efficiently store and retrieve relevant information from the codebase. Here’s a detailed technical design for such a system:

### 1. Chunk Size
Given the context window limitations (4K-8K tokens) of typical LLMs, a chunk size of around 2000 to 4000 tokens is optimal. This size allows multiple chunks to fit within the model's context limit while containing enough meaningful code segments for detailed analysis.

### 2. Metadata per Chunk
Each chunk should include:
- **File Path**: The absolute or relative path of the file where the chunk is extracted from.
- **Start Line/Byte**: Starting line and byte position in the original file.
- **End Line/Byte**: Ending line and byte position in the original file.
- **Chunk Content**: The actual code snippet (around 2000 to 4000 tokens).
- **Function Name**: If applicable, the name of the function or method where the chunk is located.
- **API Endpoint**: If the chunk corresponds to an API endpoint, its path and method type (GET, POST, etc.).
- **Context Type**: Indication if it’s a request handling, data processing, configuration, or other relevant context.

### 3. Handling Cross-File Dependencies
To handle dependencies between files:
- **Import/Require Statements**: Extract these statements and map them to their respective file paths. This can be done by parsing the code chunks using static analysis tools like tree-sitter, espree (for JavaScript), or other language-specific parsers.
- **Dependency Graph**: Build a graph where nodes are files and edges represent import/require relationships. This helps in navigating through related files for deeper understanding when needed.

### 4. Data Structures
Using a database like SQLite with Python’s sqlite3 library, we can manage the following data structures:
- A table named `chunks` to store metadata and content of each chunk.
  - **Chunk ID**: Unique identifier for each chunk.
  - **File Path**: Path from root directory to the file.
  - **Start Line/Byte**, **End Line/Byte**: Position in the original file.
  - **Content**: The actual code snippet.
  - **Function Name**: If applicable.
  - **API Endpoint Details**: As metadata.
  - **Context Type**: Additional details about the chunk’s role in the system.
- A table named `dependencies` to map import/require statements to their corresponding file paths:
  - **Chunk ID**: Referencing the chunk that has an import/require statement.
  - **Dependent Chunk Path**: The path of the file being imported or required.
  - **Type**: Whether it’s an import or require statement.

### 5. Ranking by Relevance
To rank chunks by relevance, especially when querying for specific files, functions, or lines:
- Use a scoring system where each chunk is scored based on the specificity of its content (e.g., exact function names, API endpoints mentioned).
- Utilize metadata like file paths and line numbers to fine-tune the search.
- For more complex queries involving dependencies, leverage the dependency graph to traverse through related files and functions.

### 6. Implementation Steps
1. **Code Parsing**: Write a script that extracts chunks of code (around 2000 to 4000 tokens) from each file, annotating them with metadata including import/require statements.
2. **Database Population**: Populate the `chunks` and `dependencies` tables in SQLite based on parsed data.
3. **Query Handling**: Develop a query system that can use both direct queries (e.g., “show me function X in file Y”) and indirect ones (e.g., via dependency graph for broader context).
4. **Optimization**: Consider indexing strategies to speed up search operations, especially on large datasets like method names or API endpoints which are frequently queried.
5. **Continuous Improvement**: Regularly update the database by parsing new code additions/changes in the repository and keeping track of dependencies.

This design aims to provide a robust local knowledge base for LLMs to query specific details from the Node.js API platform, enhancing its ability to suggest targeted improvements based on deep understanding of the codebase.

---

## SYNC (llama3)
What a fascinating problem! As a data synchronization architect, I'll outline a solution to keep your local knowledge base updated and accurate, despite the constantly changing codebase.

**Overview of the Approach**

We'll use a combination of techniques to maintain a high-quality local model that knows the codebase well enough to suggest specific improvements. Our approach will involve:

1. **Incremental Indexing**: We'll index only the changed parts of the codebase, rather than re-indexing everything after each update.
2. **Delta Encoding**: We'll use delta encoding to efficiently represent the changes and reduce the amount of data that needs to be processed.
3. **Renamed Function Detection**: We'll employ a renamed function detection mechanism to identify and update references to functions with new names.
4. **Staleness Detection**: We'll implement a staleness detection mechanism to determine when the knowledge base is outdated and needs to be updated.

**Technical Design**

Here's a detailed technical design for each component:

### 1. Incremental Indexing

We'll use a combination of Git hooks and a custom indexing tool to track changes in the codebase. The indexing tool will be responsible for creating an incremental index of changed files, functions, and line numbers.

* **Git Hooks**: We'll set up pre-commit and post-commit hooks in each repository to trigger the indexing process whenever there's a change.
* **Incremental Indexing Tool**: We'll write a custom tool that takes the previous index as input and updates it with the changes made since the last update. The tool will be responsible for creating an incremental index of changed files, functions, and line numbers.

### 2. Delta Encoding

To reduce the amount of data that needs to be processed, we'll use delta encoding to represent the changes in a compact format.

* **Delta Encoding Algorithm**: We'll use a variation of the standard delta encoding algorithm, which will create a sequence of patches that describe the changes made since the last update.
* **Patch Application**: The incremental indexing tool will apply these patches to the previous index to create an updated index.

### 3. Renamed Function Detection

To handle renamed functions, we'll use a combination of natural language processing (NLP) techniques and a custom detection algorithm.

* **Function Name Extraction**: We'll extract function names from the codebase using an NLP library.
* **Renamed Function Detection Algorithm**: We'll write a custom algorithm that takes the previous index as input and identifies renamed functions. The algorithm will use a combination of string similarity metrics (e.g., Levenshtein distance, Jaro-Winkler distance) to determine whether a function has been renamed.
* **Index Update**: When a renamed function is detected, we'll update the corresponding entry in the index to reflect the new name.

### 4. Staleness Detection

To determine when the knowledge base is outdated and needs to be updated, we'll use a combination of staleness metrics and a custom detection algorithm.

* **Staleness Metrics**: We'll define several staleness metrics, such as:
	+ Time since last update
	+ Number of changes since last update
	+ Ratio of changed files to total files
* **Staleness Detection Algorithm**: We'll write a custom algorithm that takes the staleness metrics as input and determines whether the knowledge base is outdated. The algorithm will use a combination of threshold-based and machine learning-based approaches to make this determination.
* **Index Update**: When the knowledge base is determined to be stale, we'll trigger an update of the index using the incremental indexing tool.

**Implementation**

To implement this design, you can:

1. Set up Git hooks in each repository to trigger the incremental indexing tool whenever there's a change.
2. Write the custom incremental indexing tool using your preferred programming language (e.g., Python, Java).
3. Implement the delta encoding algorithm and patch application logic within the incremental indexing tool.
4. Develop the renamed function detection algorithm using an NLP library (e.g., NLTK, spaCy) and implement it within the incremental indexing tool.
5. Define the staleness metrics and develop the staleness detection algorithm using a machine learning library (e.g., scikit-learn, TensorFlow).
6. Integrate the staleness detection algorithm with the incremental indexing tool to trigger updates when necessary.

**Conclusion**

By implementing this design, you'll be able to maintain a high-quality local model that knows the codebase well enough to suggest specific improvements. The incremental indexing approach will reduce the overhead of re-indexing everything after each update, while the delta encoding and renamed function detection mechanisms will help keep the knowledge base accurate and up-to-date. The staleness detection mechanism will ensure that the knowledge base is updated in a timely manner to reflect changes in the codebase.

---

## EVALUATION (mistral)
 To create a test suite that measures the local LLM's understanding of the codebase, I propose a multi-step approach involving multiple types of questions to ensure comprehensive evaluation. Here's an outline for a test design with 20 questions, each covering different aspects of the codebase:

1. File and function identification (6 questions)
   - What file handles search?
   - Which file contains the implementation for API endpoints?
   - Where is the main function defined in the CLI script?
   - What's the function responsible for generating UUIDs in your codebase?
   - Which file defines the `agent.js` class?
   - In which file is the persistent memory managed?

2. API and library usage (6 questions)
   - What's the API for UUID generation in your codebase?
   - Which library is used for handling HTTP requests?
   - Which library provides hashing functionality in your project?
   - What is the name of the package used for handling CLI arguments?
   - Where does the codebase use Redis as a persistent storage solution?
   - Which library handles the creation and management of routes in the API?

3. Code-specific issues (4 questions)
   - Describe an issue with the current implementation of hash search and suggest improvements.
   - What's the problem with the CLI command that's not working as expected, and how can it be fixed?
   - Identify a potential security vulnerability in your codebase and propose a solution.
   - Find an inconsistency in naming conventions across files and suggest a way to rectify it.

4. Additional open-ended questions (4 questions)
   - Write a brief explanation of the overall architecture of the Node.js API platform.
   - Describe the primary design choices made during the development of this codebase.
   - Discuss any notable optimization techniques used in your project to improve performance or efficiency.
   - Explain how you would approach adding a new API endpoint with authentication and database interaction.

To score the test, I suggest assigning points for each correct answer (with varying weights based on question complexity) and deducting points for incorrect answers or inappropriate responses. The pass threshold should be set at 80% of total possible points to ensure a high level of understanding of the codebase.

For example, if the total possible points are 100:
- A score between 80 and 95 would indicate good understanding (pass)
- A score below 80 would suggest further training is needed (fail)
