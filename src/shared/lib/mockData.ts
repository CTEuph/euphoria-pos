// Mock data for development - will be replaced with real data in Phase 3
export interface Product {
  id: string
  name: string
  price: number
  category: 'wine' | 'liquor' | 'beer' | 'rtd' | 'accessories'
  size: string
  barcode: string
  image?: string
  inStock: boolean
  cost: number // For employee pricing
}

export interface Customer {
  id: string
  name: string
  phone: string
  email?: string
  loyaltyPoints: number
  rfidId?: string
}

export interface CartItem extends Product {
  quantity: number
  total: number
}

export const mockProducts: Product[] = [
  // Wine
  {
    id: '1',
    name: 'Kendall-Jackson Vintner\'s Reserve Chardonnay',
    price: 18.99,
    category: 'wine',
    size: '750ml',
    barcode: '083085500321',
    inStock: true,
    cost: 12.50
  },
  {
    id: '2',
    name: 'Caymus Cabernet Sauvignon',
    price: 89.99,
    category: 'wine',
    size: '750ml',
    barcode: '083085500322',
    inStock: true,
    cost: 65.00
  },
  {
    id: '3',
    name: 'La Crema Pinot Noir',
    price: 24.99,
    category: 'wine',
    size: '750ml',
    barcode: '083085500323',
    inStock: true,
    cost: 16.75
  },
  {
    id: '4',
    name: 'Dom Pérignon Champagne',
    price: 249.99,
    category: 'wine',
    size: '750ml',
    barcode: '083085500324',
    inStock: true,
    cost: 180.00
  },
  {
    id: '5',
    name: 'Apothic Red Wine',
    price: 12.99,
    category: 'wine',
    size: '750ml',
    barcode: '083085500325',
    inStock: true,
    cost: 8.50
  },
  {
    id: '6',
    name: 'Bogle Cabernet Sauvignon',
    price: 16.99,
    category: 'wine',
    size: '1.5L',
    barcode: '083085500326',
    inStock: true,
    cost: 11.25
  },

  // Liquor
  {
    id: '7',
    name: 'Jack Daniel\'s Old No. 7',
    price: 24.99,
    category: 'liquor',
    size: '750ml',
    barcode: '082184090563',
    inStock: true,
    cost: 18.50
  },
  {
    id: '8',
    name: 'Grey Goose Vodka',
    price: 44.99,
    category: 'liquor',
    size: '750ml',
    barcode: '080686016120',
    inStock: true,
    cost: 32.00
  },
  {
    id: '9',
    name: 'Hennessy VS Cognac',
    price: 54.99,
    category: 'liquor',
    size: '750ml',
    barcode: '088110123456',
    inStock: true,
    cost: 38.75
  },
  {
    id: '10',
    name: 'Tito\'s Handmade Vodka',
    price: 19.99,
    category: 'liquor',
    size: '750ml',
    barcode: '619947000019',
    inStock: true,
    cost: 14.50
  },
  {
    id: '11',
    name: 'Jameson Irish Whiskey',
    price: 27.99,
    category: 'liquor',
    size: '750ml',
    barcode: '080432114896',
    inStock: true,
    cost: 20.25
  },
  {
    id: '12',
    name: 'Patron Silver Tequila',
    price: 49.99,
    category: 'liquor',
    size: '750ml',
    barcode: '721733902217',
    inStock: true,
    cost: 36.00
  },

  // Beer
  {
    id: '13',
    name: 'Corona Extra 12-Pack',
    price: 16.99,
    category: 'beer',
    size: '12 x 12oz',
    barcode: '048100003441',
    inStock: true,
    cost: 12.50
  },
  {
    id: '14',
    name: 'Bud Light 24-Pack',
    price: 22.99,
    category: 'beer',
    size: '24 x 12oz',
    barcode: '018200000016',
    inStock: true,
    cost: 17.25
  },
  {
    id: '15',
    name: 'Stella Artois 6-Pack',
    price: 10.99,
    category: 'beer',
    size: '6 x 11.2oz',
    barcode: '012000001239',
    inStock: true,
    cost: 7.75
  },

  // RTD (Ready to Drink)
  {
    id: '16',
    name: 'White Claw Hard Seltzer Variety Pack',
    price: 17.99,
    category: 'rtd',
    size: '12 x 12oz',
    barcode: '635985654321',
    inStock: true,
    cost: 13.25
  },
  {
    id: '17',
    name: 'High Noon Sun Sips Variety Pack',
    price: 18.99,
    category: 'rtd',
    size: '8 x 12oz',
    barcode: '635985654322',
    inStock: true,
    cost: 14.00
  },
  {
    id: '18',
    name: 'Truly Hard Seltzer Mixed Pack',
    price: 16.99,
    category: 'rtd',
    size: '12 x 12oz',
    barcode: '635985654323',
    inStock: true,
    cost: 12.75
  },

  // Accessories
  {
    id: '19',
    name: 'Wine Opener - Waiter\'s Corkscrew',
    price: 12.99,
    category: 'accessories',
    size: 'One Size',
    barcode: '123456789012',
    inStock: true,
    cost: 7.50
  },
  {
    id: '20',
    name: 'Whiskey Stones Set',
    price: 19.99,
    category: 'accessories',
    size: '9 pieces',
    barcode: '123456789013',
    inStock: true,
    cost: 12.00
  }
]

export const mockCustomers: Customer[] = [
  {
    id: '1',
    name: 'John Smith',
    phone: '555-123-4567',
    email: 'john@example.com',
    loyaltyPoints: 1250,
    rfidId: 'RFID001'
  },
  {
    id: '2',
    name: 'Sarah Johnson',
    phone: '555-987-6543',
    email: 'sarah@example.com',
    loyaltyPoints: 875
  },
  {
    id: '3',
    name: 'Mike Davis',
    phone: '555-456-7890',
    email: 'mike@example.com',
    loyaltyPoints: 2100,
    rfidId: 'RFID002'
  },
  {
    id: '4',
    name: 'Emily Wilson',
    phone: '555-321-0987',
    email: 'emily@example.com',
    loyaltyPoints: 550
  },
  {
    id: '5',
    name: 'David Brown',
    phone: '555-654-3210',
    email: 'david@example.com',
    loyaltyPoints: 1780
  }
]

// Tax rate for calculations
export const TAX_RATE = 0.0875 // 8.75% sales tax

// Category labels and icons
export const categories = [
  { id: 'wine', label: 'Wine', icon: '🍷' },
  { id: 'liquor', label: 'Liquor', icon: '🥃' },
  { id: 'beer', label: 'Beer', icon: '🍺' },
  { id: 'rtd', label: 'RTD', icon: '🥤' },
  { id: 'accessories', label: 'Accessories', icon: '🔧' }
] as const