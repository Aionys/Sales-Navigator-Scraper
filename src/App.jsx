import { TiUserAdd, TiContacts } from "react-icons/ti";
import { useState } from "react";
import LeadList from "./Pages/LeadList";
import SearchList from "./Pages/SearchList";

function App() {
  const [pageView, setPageView] = useState("Search List");

  return (
    <div className="flex flex-col min-h-[25rem] min-w-[20rem] bg-gray-200">
      <section className="flex items-center">
      <button
          onClick={() => setPageView("Search List")}
          className={`flex items-center gap-2 w-full py-2 px-4 hover:bg-[#990099] duration-300 ${
            pageView == "Search List"
              ? "bg-[#990099] text-white"
              : "bg-[#cc66cc] text-[#98b2c8]"
          }`}
        >
          <TiUserAdd size={20} />
          <p className={`font-semibold tracking-wider`}>Search List</p>
        </button>
        <button
          onClick={() => setPageView("Lead List")}
          className={`flex items-center gap-2 w-full py-2 px-4 hover:bg-[#990099] duration-300 ${
            pageView == "Lead List"
              ? "bg-[#990099] text-white"
              : "bg-[#cc66cc] text-[#98b2c8]"
          }`}
        >
          <TiContacts size={20} />
          <p className={`font-semibold tracking-wider`}>Lead List</p>
        </button>
      </section>

      <section className="mb-auto mt-4">
        {pageView === "Lead List" ? (
          <LeadList />
        ) : pageView === "Search List" ? (
          <SearchList />
        ) : (
          ""
        )}
      </section>

      <footer className="px-2">
        <a
          href="https://qtecsolution.com/"
          className="w-full block text-left font-small text-gray-500 px-1 pb-2"
        >
          © Developed by <span className="text-purple-400 font-small">Qtec Solution</span> LTD All rights reserved.
          Edited by <span className="text-purple-400 font-small">Shayan Ghiaseddin</span>.
        </a>
      </footer>
    </div>
  );
}

export default App;
