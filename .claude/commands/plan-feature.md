# EUPHORIA POS FEATURE PLANNING COMMAND

## Command Usage:
```
/plan-feature [TASK_ID] [GUIDE_PATH] [MODE]

Examples:
/plan-feature task-1.1 ai-docs/implementation-guide.md        # Full planning
/plan-feature task-1.1 ai-docs/implementation-guide.md quick  # Phases 1-3 only
```

## Variables:
- task_id: $1 (e.g., "task-1.1")
- guide_path: $2 (e.g., "ai-docs/implementation-guide.md")
- mode: $3 (optional: "quick" for abbreviated planning - stop at phase 3 and output )

## Output Configuration:
- Output file: `/deep-plans/[TASK_ID]-plan.md`
- Create directory if not exists: `mkdir -p deep-plans`
- Filename example: `deep-plans/task-1.1-plan.md`

---

# PLANNING EXECUTION

Read the task specification from `$2` for task `$1`. Analyze the current codebase context.

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
Consider multiple implementation approaches:

**Approach A**: [First approach]
- Pros: [List advantages]
- Cons: [List disadvantages]
- Complexity: Low/Medium/High

**Approach B**: [Alternative approach]
- Pros: [List advantages]
- Cons: [List disadvantages]
- Complexity: Low/Medium/High

**Recommended**: [Choose with justification]

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

## PHASE 3: ARCHITECTURAL DESIGN

### 3.1 File Structure
```
src/features/[feature]/
├── components/
│   └── [Component].tsx
├── hooks/
│   └── use[Feature].ts
├── store/
│   └── [feature].store.ts  # If state needed
├── services/
│   └── [feature].service.ts  # If business logic complex
└── types.ts
```

### 3.2 State Design (if applicable)
```typescript
interface [Feature]State {
  // Data
  
  // UI State
  
  // Computed (stored)
  
  // Actions
}
```

### 3.3 Component Hierarchy
```
<ParentComponent>
  <FeatureComponent>
    <SubComponent1 />
    <SubComponent2 />
  </FeatureComponent>
</ParentComponent>
```

[IF MODE !== "quick", CONTINUE WITH PHASES 4-6]

## PHASE 4: IMPLEMENTATION BREAKDOWN

### 4.1 Sub-task Decomposition

#### Sub-task 1: [Name] (Est: X hrs)
**Goal**: [Clear objective]

**Files**:
- CREATE: `path/to/file.ts`
  ```typescript
  // Key structure
  ```
- MODIFY: `path/to/existing.ts`
  - Add: [what to add]
  - Update: [what to change]

**Test Cases**:
1. [Test scenario]
2. [Test scenario]

#### Sub-task 2: [Name] (Est: X hrs)
[Repeat structure]

### 4.2 Implementation Sequence
```
1. Sub-task 1 (no dependencies)
   ↓
2. Sub-task 2 (depends on 1)
   ↓
3. Sub-task 3 (can parallelize with 2)
```

## PHASE 5: TESTING & VALIDATION

### 5.1 Automated Tests
```typescript
// Unit tests needed
describe('[Feature]', () => {
  test('should [behavior]', () => {
    // Test case
  });
});
```

### 5.2 Manual Testing Checklist
- [ ] Happy path: [Steps]
- [ ] Edge case 1: [Steps]
- [ ] Edge case 2: [Steps]
- [ ] Performance: [Metric to verify]

### 5.3 Integration Testing
- [ ] Works with existing features
- [ ] No state conflicts
- [ ] Proper error handling
- [ ] Accessibility verified

## PHASE 6: DOCUMENTATION & DEPLOYMENT

### 6.1 Documentation Updates
- [ ] Update README if needed
- [ ] Add inline code comments
- [ ] Update API documentation
- [ ] Add to feature list

### 6.2 Deployment Checklist
- [ ] Code review completed
- [ ] Tests passing
- [ ] No console errors
- [ ] Performance acceptable
- [ ] Stakeholder approval

---

## SUMMARY

### Executive Summary
[2-3 sentence overview of the implementation plan]

### Time Estimate
- Development: X hours
- Testing: Y hours
- Total: Z hours (with buffer)

### Success Metrics
1. [Specific measurable outcome]
2. [Specific measurable outcome]
3. [Specific measurable outcome]

### Open Questions
- [ ] [Question needing clarification]
- [ ] [Decision needed from stakeholder]

### Next Steps
1. Review and approve this plan
2. Create feature branch: `feature/[task-id]-[name]`
3. Implement Sub-task 1
4. Continue per sequence

