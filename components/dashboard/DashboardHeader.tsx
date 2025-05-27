'use client';

import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';

interface DashboardHeaderProps {
  user?: {
    id?: string;
    email?: string;
    displayName?: string;
    profilePicture?: string;
  } | null;
  onShowProfile: () => void;
  onLogout: () => void;
}

export default function DashboardHeader({ user, onShowProfile, onLogout }: DashboardHeaderProps) {
  const getUserInitials = () => {
    if (!user?.displayName) return 'U';
    const names = user.displayName.split(' ');
    if (names.length >= 2) {
      return `${names[0][0]}${names[1][0]}`.toUpperCase();
    }
    return names[0].substring(0, 2).toUpperCase();
  };

  return (
    <div className="flex justify-between items-start mb-8">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 truncate">
          Contract Dashboard
        </h1>
        <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
          BETA
        </span>
      </div>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-2 px-2 hover:bg-gray-100 ml-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user?.profilePicture || ''} alt={user?.displayName || 'User'} />
              <AvatarFallback className="bg-blue-600 text-white">{getUserInitials()}</AvatarFallback>
            </Avatar>
            <div className="hidden sm:flex flex-col items-start text-sm">
              <span className="font-medium">{user?.displayName || 'User'}</span>
              <span className="text-xs text-gray-500">{user?.email}</span>
            </div>
            <ChevronDown className="h-4 w-4 text-gray-500 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="sm:hidden px-2 py-1.5 border-b">
            <p className="font-medium text-sm">{user?.displayName || 'User'}</p>
            <p className="text-xs text-gray-500">{user?.email}</p>
          </div>
          <DropdownMenuLabel className="hidden sm:block">My Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="cursor-pointer" onClick={onShowProfile}>
            <span>Profile</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onLogout} className="cursor-pointer text-red-600">
            <span>Logout</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
} 