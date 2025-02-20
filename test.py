import requests
import json

def send_linkedin_connection_request(profile_url, message):
    # API endpoint
    url = "http://localhost:3000/send-connection-request"
    
    # Request headers
    headers = {
        "Content-Type": "application/json"
    }
    
    # Request payload
    payload = {
        "profileUrl": profile_url,
        "messageTemplate": message
    }
    
    try:
        # Send POST request
        response = requests.post(url, headers=headers, json=payload)
        
        # Check if request was successful
        response.raise_for_status()
        
        # Parse and return response
        result = response.json()
        print(f"Success: {result}")
        return result
        
    except requests.exceptions.RequestException as e:
        print(f"Error: {str(e)}")
        return None

# Example usage
if __name__ == "__main__":
    profile_url = "https://www.linkedin.com/in/rayen-haddad-8146121b7/"
    message = ""
    
    send_linkedin_connection_request(profile_url, message)