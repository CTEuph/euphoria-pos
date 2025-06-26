# EUPHORIA POS FEATURE PLANNING COMMAND

## Command Usage:
```
/plan-feature [TASK_ID] [GUIDE_PATH]

Examples:
/plan-feature task-1.1 _plans/high-plans/implementation-guide.md        # Full planning

```

## Variables:
- task_id: $1 (e.g., "task-1.1")
- guide_path: $2 (e.g., "ai-docs/implementation-guide.md")


## Output Configuration:
- Output file: `_obsidian/feature-plans/[TASK_ID]/[TASK_ID]-plan-p1.md`
- Create directory if not exists: `mkdir -p [TASK_ID]`
- Filename example: `task-1.1/task-1.1-plan-p1.md`

---

# PLANNING EXECUTION

Read the task specification from `$2` for task `$1`. Analyze the current codebase context and the following documents:
_obsidian/PRD.md

## PHASE 1: DEEP CONTEXT ANALYSIS

### 1.1 Task Specification Comprehension
Extract from the implementation guide:
- Core objective and business value
- Explicit requirements and constraints
- Acceptance criteria that define "done"
- Dependencies on other tasks or features

### 1.2 Codebase Archaeological Survey
Analyze the current codebase structure:
- `/src/features/*` - Existing feature implementations
- `/src/shared/*` - Shared components and utilities
- `/electron/*` - Main process implementations
- Current patterns in use (Zustand stores, IPC handlers, etc.)

### 1.3 Integration Mapping
Identify how this feature interacts with:
- Existing checkout flow
- Current state management
- Authentication system
- Hardware abstractions (if applicable)

## PHASE 2: SOLUTION SPACE EXPLORATION

### 2.1 Technical Approach Evaluation
Consider multiple implementation approaches by spinning up 3 sub agents to all create an implementation approach:

**Approach A**: [First approach]
- Pros: [List advantages]
- Cons: [List disadvantages]
- Complexity: Low/Medium/High

**Approach B**: [Alternative approach]
- Pros: [List advantages]
- Cons: [List disadvantages]
- Complexity: Low/Medium/High

**Approach C**: [Alternative approach]
- Pros: [List advantages]
- Cons: [List disadvantages]
- Complexity: Low/Medium/High


**Recommended**: [Lead agent should look through the options and choose one with justification]

### 2.2 Edge Case Identification
Critical scenarios to handle:
- Hardware failures (if applicable)
- Network disconnections
- Concurrent operations
- Invalid inputs
- Performance boundaries

### 2.3 Risk Assessment
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| [Risk 1] | H/M/L | H/M/L | [Strategy] |
| [Risk 2] | H/M/L | H/M/L | [Strategy] |



## SUMMARY

### Executive Summary
[2-3 sentence overview of the implementation plan]


### Success Metrics
1. [Specific measurable outcome]
2. [Specific measurable outcome]
3. [Specific measurable outcome]

### Open Questions
- [ ] [Question needing clarification]
- [ ] [Decision needed from stakeholder]

### Next Steps
1. Review and approve this plan
2. Move onto the second planning prompt
3. Detail this plan into tasks and sub tasks
4. Create feature branch: `feature/[task-id]-[name]`
5. Implement Sub-task 1
6. Continue per sequence
