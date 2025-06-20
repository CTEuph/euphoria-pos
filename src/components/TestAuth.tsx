import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'

export function TestAuth() {
  const [pin, setPin] = useState('')
  const [result, setResult] = useState<string>('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Debug window.electron
    console.log('window.electron:', window.electron)
    console.log('window:', window)
  }, [])

  const testAuth = async () => {
    setLoading(true)
    try {
      // Check if electron API exists
      if (!window.electron) {
        setResult('Error: window.electron is not defined. Check preload script.')
        setLoading(false)
        return
      }

      // Test PIN verification
      const employee = await window.electron.auth.verifyPin(pin)
      if (employee) {
        setResult(`Success! Logged in as: ${employee.firstName} ${employee.lastName} (ID: ${employee.id})`)
      } else {
        setResult('Invalid PIN')
      }
    } catch (error: any) {
      setResult(`Error: ${error.message}`)
    }
    setLoading(false)
  }

  const testGetEmployee = async () => {
    try {
      if (!window.electron) {
        setResult('Error: window.electron is not defined')
        return
      }
      const employee = await window.electron.auth.getCurrentEmployee()
      if (employee) {
        setResult(`Current employee: ${employee.name} (ID: ${employee.id})`)
      } else {
        setResult('No employee logged in')
      }
    } catch (error: any) {
      setResult(`Error: ${error.message}`)
    }
  }

  const testLogout = async () => {
    try {
      if (!window.electron) {
        setResult('Error: window.electron is not defined')
        return
      }
      await window.electron.auth.logout()
      setResult('Logged out successfully')
    } catch (error: any) {
      setResult(`Error: ${error.message}`)
    }
  }

  return (
    <div className="w-96 mx-auto mt-8 p-6 bg-white rounded-lg shadow">
      <h2 className="text-xl font-bold mb-4">Test Authentication System</h2>
      
      <div className="space-y-4">
        <div>
          <input
            type="text"
            placeholder="Enter PIN (try 1234, 5678, or 9999)"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
        
        <div className="flex gap-2">
          <Button onClick={testAuth} disabled={loading}>
            Test Login
          </Button>
          <Button onClick={testGetEmployee} variant="outline">
            Get Current
          </Button>
          <Button onClick={testLogout} variant="outline">
            Logout
          </Button>
        </div>

        {result && (
          <div className={`p-3 rounded ${result.includes('Error') ? 'bg-red-100' : 'bg-green-100'}`}>
            {result}
          </div>
        )}

        <div className="text-sm text-gray-600">
          <p>Test PINs:</p>
          <ul className="list-disc list-inside">
            <li>1234 - John Doe (Manager)</li>
            <li>5678 - Jane Smith</li>
            <li>9999 - Mike Johnson</li>
          </ul>
        </div>
      </div>
    </div>
  )
}