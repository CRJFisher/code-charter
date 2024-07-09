import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="flex justify-between items-center p-4 bg-gray-800 text-white">
      <h1 className="text-xl">Code Base Analysis</h1>
      <div className="flex space-x-4">
        <button className="btn btn-primary">Refresh</button>
        <select className="select select-bordered">
          <option value="">Filter by status</option>
          <option value="not-summarised">Not Summarised</option>
          <option value="partially-summarised">Partially Summarised</option>
          <option value="summarised">Summarised</option>
        </select>
      </div>
    </header>
  );
};

export default Header;
