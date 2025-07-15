import ReactTest from "./components/ReactTest";


function App() {
  console.log("App component is rendering...");
  
  try {
    return <ReactTest />;
  } catch (error) {
    console.error("Error in App component:", error);
    return <div>Error loading application</div>;
  }
}

export default App;