# Index — Cross platform information management application.

## What problem does this application solve?
File management today is a nightmare. Having multiple devices without a unifying personal file manager causes low grade headaches for all users. Cloud file managers such as Google Drive, Dropbox, etc… attempt to address this problem, but in so doing, reveal a more fundamental flaw with our current file management paradigm, the Hierarchical File System.

Files are forced to live in one location. They cannot be accessed dynamically based on content, only by location. As a human being, sorting files into arbitrary hierarchies without flexibility may have been sufficient in the past, but with single users now saving and managing potentially thousands of files, we all know it just isn’t cutting it.

## Hierarchical File Systems — The Problem
Directories are meant to be understood by computers, not by people.
Our thoughts, indeed the general structure of information and knowledge as it exists in the universe, does not map onto strict hierarchies. It is rhizomatic by nature.

## Graphs for non-hierarchical file management — The Solution

## Tags

## Virtual Folders
Now I’m not on a crusade against folders here folks, let’s be honest, we have them still because they work at a certain scale, and they’re quite simple to use.
Let’s keep using folders, but make them behave a little differently.
Rather than a folder being the same as a directory, a folder is now more of a “virtual” directory, where you can place a file inside, and that file inherits the ‘attribute’ of that folder. For example, if you put a file in the “Photos” folder, that file gains the tagged attribute “photo”. The file itself is not moved into that specific location, it remains in the global file space, meaning that the same file can be added to any number of folders, without creating duplicates, since the “file” displayed within the virtual folder is merely a reference to the source file itself. 