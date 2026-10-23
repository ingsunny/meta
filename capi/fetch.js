async function getFuseClickOffers() {
  // Try to use HTTPS if the API supports it to avoid Mixed Content errors
  const apiUrl =
    "https://paychat.fuseclick.com/api/v2/getOffers?key=7F81AA781FBA6442D7249382927A37E5&limit=500&page=1";

  try {
    const response = await fetch(apiUrl);

    // Check if the response was successful (Status 200-299)
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    console.log("Successfully fetched offers:", data);

    // You can now loop through data.offers (or whatever the payload structure is)
    // and inject it into your HTML!
  } catch (error) {
    console.error("Error fetching from FuseClick API:", error);
  }
}

// Call the function
getFuseClickOffers();
