## 🎯 **Phased Implementation Plan**

### **Phase 1: Foundation (Week 1)**
**Documents to use:**
- Tech Stack & Project Structure
- Clean Boilerplate
- AI Coding Rules

**Goals:**
- Get basic checkout working
- Cart management
- PIN authentication
- Mock data only

**AI Prompt Example:**
```
Modern Minimalist POS

Create a clean, modern POS interface for Euphoria Liquor with the following layout:

Left sidebar (300px): Product categories with wine/liquor/RTD/accessories icons, search bar at top

Center main area: Large product grid with high-quality product images, prices prominently displayed

Right sidebar (350px): Shopping cart with line items, customer info card at top, payment buttons at bottom

Top bar: Store logo, current cashier name, time/date, and quick action buttons

Color scheme: White background, slate gray text, sophisticated purple for buttons and highlights (Euphoria Purple)

Typography: Clean sans-serif, large readable fonts for accessibility

Key features: Barcode scanner input prominently placed, one-click customer lookup, split payment buttons
```

### **Phase 2: State & Business Logic (Week 2)**
**Add documents:**
- API & State Management Principles
- Mini PRD (for business rules)

**Goals:**
- Case discount logic
- Customer management
- Multi-tender payments
- Proper state patterns

**AI Prompt Example:**
```
"Following the API Principles doc, implement the case discount logic from the PRD. Wine: 12x750ml = 10% off"
```

### **Phase 3: Database Integration (Week 3)**
**Add documents:**
- Drizzle Schema
- Keep: API Principles

**Goals:**
- Connect Supabase
- Real product data
- Transaction persistence
- Inventory tracking

**AI Prompt Example:**
```
"Using the Drizzle schema, create IPC handlers for product lookup and transaction saving"
```

### **Phase 4: Hardware (Week 4)**
**Use:**
- AI Coding Rules
- API Principles
- Specific hardware docs

**Goals:**
- Real scanner
- Receipt printer
- Cash drawer
- Payment terminal

## 📋 **Document Usage Strategy**

### **Always Include:**
```
1. AI Coding Rules (keeps code consistent)
2. Current phase's main document
```

### **Reference When Needed:**
```
- PRD: For specific business logic questions
- Schema: Only when working with database
- API Principles: For IPC/state questions
```

### **Context Management Tips:**

**Option 1: Sectioned Prompts**
```
"Following the State Management section of API Principles, 
refactor the cart to avoid re-render issues"
```

**Option 2: Summary Context**
```
"This is a POS system using Electron+React with vertical 
slice architecture. Following the established patterns, 
implement customer search..."
```

**Option 3: Progressive Context**
```
Initial: "Create a product search component"
Follow-up: "Now add it to the checkout feature following 
our vertical slice structure"
```

## 🎨 **Recommended Approach**

### **Week 1 Plan:**
```markdown
## Current Context:
- Tech Stack: Electron, React, Zustand, Tailwind 3.x
- Architecture: Vertical slices, IPC for hardware
- Current Goal: Basic checkout with mock data

## Task:
Implement product search that filters the mock products list

## Reference:
- Follow patterns in checkout.store.ts
- Put component in features/checkout/components/
```

This gives AI just enough context without overwhelming it.

### **Document Rotation:**
- **Mon-Tue**: Foundation docs
- **Wed-Thu**: Add business logic docs  
- **Fri**: Add database schema
- **Next week**: Fresh context with new phase

## 💡 **Pro Tips**

1. **Start Small**: Don't mention Supabase until Phase 3
2. **Build Up**: Add complexity gradually
3. **Reset When Needed**: "Let's start fresh. Here's what we have so far..."
4. **Specific Sections**: "Using the IPC patterns from lines 50-100..."

Want me to create a specific Week 1 implementation plan with daily tasks and which documents to use each day?